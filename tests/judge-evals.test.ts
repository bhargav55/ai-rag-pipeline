import { describe, expect, it } from "vitest";
import {
  buildJudgePrompt,
  judgeRagEvalResults,
  parseJudgeScore,
  summarizeJudgeResults,
  type JudgeScore,
} from "../src/judge-evals";
import type { LlmClient, LlmPrompt } from "../src/types";
import type { RagEvalResult } from "../src/evals";

class FakeJudgeLlm implements LlmClient {
  readonly prompts: LlmPrompt[] = [];

  constructor(private readonly scores: JudgeScore[]) {}

  async answer(prompt: LlmPrompt) {
    this.prompts.push(prompt);
    const score = this.scores.shift();
    if (!score) throw new Error("missing fake judge score");
    return JSON.stringify(score);
  }
}

const evalResult = (overrides: Partial<RagEvalResult> = {}): RagEvalResult => ({
  id: "protocol-config-fees-and-leverage",
  question: "what are this protocol's margin ratio, fees, and leverage limits?",
  passed: true,
  retrievalPassed: true,
  answerPassed: true,
  expectedSources: ["protocol/configuration.md"],
  actualSources: ["protocol/configuration.md"],
  missingSources: [],
  mustMention: ["6%", "0.01%", "0.05%", "1.00%", "10x", "1x"],
  missingTerms: [],
  answer:
    "The protocol maintenance margin ratio is 6%, maker fee is 0.01%, taker fee is 0.05%, liquidator fee is 1.00%, and leverage ranges from 1x to 10x [1].",
  contexts: [
    "maintenance margin ratio = 6%\nmaker fee = 0.01%\ntaker fee = 0.05%\nliquidator fee = 1.00%\nmaximum leverage = 10x\nminimum leverage = 1x",
  ],
  reference:
    "The protocol baseline maintenance margin ratio is 6%. The maker fee is 0.01%, the taker fee is 0.05%, and the liquidator fee is 1.00%. Baseline leverage ranges from 1x to 10x.",
  ...overrides,
});

describe("parseJudgeScore", () => {
  it("validates judge JSON scores and rationale", () => {
    expect(
      parseJudgeScore(
        JSON.stringify({
          faithfulness: 0.95,
          relevance: 0.9,
          citationCorrectness: 1,
          passed: true,
          rationale: "Answer only uses retrieved protocol config values.",
        }),
      ),
    ).toEqual({
      faithfulness: 0.95,
      relevance: 0.9,
      citationCorrectness: 1,
      passed: true,
      rationale: "Answer only uses retrieved protocol config values.",
    });
  });

  it("rejects malformed or out-of-range judge scores", () => {
    expect(() =>
      parseJudgeScore(
        JSON.stringify({
          faithfulness: 1.2,
          relevance: 0.9,
          citationCorrectness: 1,
          passed: true,
          rationale: "invalid",
        }),
      ),
    ).toThrow("Judge response did not match expected schema");
  });
});

describe("buildJudgePrompt", () => {
  it("builds a rubric prompt from question, answer, context, and reference", () => {
    const prompt = buildJudgePrompt(evalResult());

    expect(prompt.system).toContain("RAG answer quality judge");
    expect(prompt.user).toContain("Question:");
    expect(prompt.user).toContain("Retrieved context:");
    expect(prompt.user).toContain("Reference answer:");
    expect(prompt.user).toContain("faithfulness");
    expect(prompt.user).toContain("citationCorrectness");
  });
});

describe("judgeRagEvalResults", () => {
  it("scores eval results with an LLM judge and preserves deterministic eval status", async () => {
    const judge = new FakeJudgeLlm([
      {
        faithfulness: 0.96,
        relevance: 0.91,
        citationCorrectness: 1,
        passed: true,
        rationale: "All facts are present in the retrieved protocol config context.",
      },
    ]);

    const judged = await judgeRagEvalResults({
      results: [evalResult()],
      judgeClient: judge,
    });

    expect(judged).toEqual([
      {
        ...evalResult(),
        judge: {
          faithfulness: 0.96,
          relevance: 0.91,
          citationCorrectness: 1,
          passed: true,
          rationale: "All facts are present in the retrieved protocol config context.",
        },
      },
    ]);
    expect(judge.prompts).toHaveLength(1);
  });
});

describe("summarizeJudgeResults", () => {
  it("summarizes average judge scores and pass counts", () => {
    expect(
      summarizeJudgeResults([
        {
          ...evalResult({ id: "a" }),
          judge: { faithfulness: 1, relevance: 0.8, citationCorrectness: 1, passed: true, rationale: "good" },
        },
        {
          ...evalResult({ id: "b", passed: false }),
          judge: { faithfulness: 0.4, relevance: 0.6, citationCorrectness: 0, passed: false, rationale: "bad" },
        },
      ]),
    ).toEqual({
      total: 2,
      passed: 1,
      failed: 1,
      averages: {
        faithfulness: 0.7,
        relevance: 0.7,
        citationCorrectness: 0.5,
      },
    });
  });
});
