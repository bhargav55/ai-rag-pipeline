import { describe, expect, it } from "vitest";
import { evaluateRag, summarizeEvalResults } from "../src/evals";
import type { EmbeddedChunk, EmbeddingClient, LlmClient, LlmPrompt, SearchResult, VectorSearchStore } from "../src/types";

const chunk = (sourcePath: string, id: string, text: string): EmbeddedChunk => ({
  id,
  sourcePath,
  domain: sourcePath.split("/")[0] ?? "docs",
  index: Number(id.split("chunk-")[1] ?? 0),
  text,
  embedding: [1, 0, 0],
});

class FakeEmbeddingClient implements EmbeddingClient {
  async embed(input: string[]) {
    return input.map(() => [1, 0, 0]);
  }
}

class FakeStore implements VectorSearchStore {
  constructor(private readonly byQuestion: Record<string, SearchResult[]>) {}

  search(_queryEmbedding: number[], topK: number) {
    return Object.values(this.byQuestion)[0]?.slice(0, topK) ?? [];
  }
}

class FakeLlm implements LlmClient {
  constructor(private readonly answerText: string) {}

  async answer(_prompt: LlmPrompt) {
    return this.answerText;
  }
}

describe("evaluateRag", () => {
  it("passes when retrieved sources and required answer terms match", async () => {
    const results = await evaluateRag({
      cases: [
        {
          id: "maintenance-margin-liquidation",
          question: "what happens when margin falls below maintenance?",
          expectedSources: ["perps/margin.md", "risk/liquidation.md"],
          mustMention: ["maintenance margin", "liquidation", "account equity"],
        },
      ],
      topK: 3,
      embeddingClient: new FakeEmbeddingClient(),
      store: new FakeStore({
        default: [
          { chunk: chunk("perps/margin.md", "perps/margin.md#chunk-1", "maintenance margin"), score: 0.53 },
          { chunk: chunk("risk/liquidation.md", "risk/liquidation.md#chunk-0", "liquidation"), score: 0.51 },
        ],
      }),
      llmClient: new FakeLlm("Account equity below maintenance margin triggers liquidation."),
    });

    expect(results).toEqual([
      {
        id: "maintenance-margin-liquidation",
        question: "what happens when margin falls below maintenance?",
        passed: true,
        retrievalPassed: true,
        answerPassed: true,
        expectedSources: ["perps/margin.md", "risk/liquidation.md"],
        actualSources: ["perps/margin.md", "risk/liquidation.md"],
        missingSources: [],
        mustMention: ["maintenance margin", "liquidation", "account equity"],
        missingTerms: [],
        answer: "Account equity below maintenance margin triggers liquidation.",
      },
    ]);
  });

  it("reports missing sources and missing answer terms", async () => {
    const results = await evaluateRag({
      cases: [
        {
          id: "oracle-staleness",
          question: "what happens if oracle prices are stale?",
          expectedSources: ["risk/oracle.txt"],
          mustMention: ["stale", "oracle", "circuit breaker"],
        },
      ],
      topK: 1,
      embeddingClient: new FakeEmbeddingClient(),
      store: new FakeStore({
        default: [{ chunk: chunk("perps/funding.md", "perps/funding.md#chunk-0", "funding"), score: 0.4 }],
      }),
      llmClient: new FakeLlm("Funding payments transfer between longs and shorts."),
    });

    expect(results[0]).toMatchObject({
      id: "oracle-staleness",
      passed: false,
      retrievalPassed: false,
      answerPassed: false,
      actualSources: ["perps/funding.md"],
      missingSources: ["risk/oracle.txt"],
        missingTerms: ["stale", "oracle", "circuit breaker"],
        answer: "Funding payments transfer between longs and shorts.",
    });
  });
});

describe("summarizeEvalResults", () => {
  it("summarizes total, passed, and failed counts", () => {
    expect(
      summarizeEvalResults([
        { id: "a", question: "q", passed: true, retrievalPassed: true, answerPassed: true, expectedSources: [], actualSources: [], missingSources: [], mustMention: [], missingTerms: [], answer: "ok" },
        { id: "b", question: "q", passed: false, retrievalPassed: false, answerPassed: true, expectedSources: [], actualSources: [], missingSources: [], mustMention: [], missingTerms: [], answer: "no" },
      ]),
    ).toEqual({ total: 2, passed: 1, failed: 1 });
  });
});
