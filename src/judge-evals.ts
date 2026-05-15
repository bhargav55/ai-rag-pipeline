import { z } from "zod";
import type { RagEvalResult } from "./evals";
import type { LlmClient, LlmPrompt } from "./types";

const scoreSchema = z.object({
  faithfulness: z.number().min(0).max(1),
  relevance: z.number().min(0).max(1),
  citationCorrectness: z.number().min(0).max(1),
  passed: z.boolean(),
  rationale: z.string().min(1),
});

export type JudgeScore = z.infer<typeof scoreSchema>;

export type JudgedRagEvalResult = RagEvalResult & {
  judge: JudgeScore;
};

export type JudgeEvalSummary = {
  total: number;
  passed: number;
  failed: number;
  averages: {
    faithfulness: number;
    relevance: number;
    citationCorrectness: number;
  };
};

type JudgeRagEvalResultsInput = {
  results: RagEvalResult[];
  judgeClient: LlmClient;
};

const extractJson = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
};

export const parseJudgeScore = (raw: string): JudgeScore => {
  try {
    return scoreSchema.parse(JSON.parse(extractJson(raw)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Judge response did not match expected schema: ${message}`);
  }
};

export const buildJudgePrompt = (result: RagEvalResult): LlmPrompt => ({
  system:
    "You are a strict RAG answer quality judge. Score only the provided answer against the retrieved context, question, citations, and optional reference answer. Return only valid JSON.",
  user: `Question:\n${result.question}\n\nRetrieved context:\n${result.contexts
    .map((context, index) => `[${index + 1}] ${context}`)
    .join("\n\n---\n\n")}\n\nAnswer:\n${result.answer}\n\nReference answer:\n${
    result.reference ?? "No reference answer provided. Judge against retrieved context only."
  }\n\nDeterministic eval status:\n- retrievalPassed: ${result.retrievalPassed}\n- answerPassed: ${result.answerPassed}\n- missingSources: ${result.missingSources.join(", ") || "none"}\n- missingTerms: ${result.missingTerms.join(", ") || "none"}\n\nRubric:\n- faithfulness: number from 0 to 1. 1 means every factual claim is supported by retrieved context. Penalize invented facts.\n- relevance: number from 0 to 1. 1 means the answer directly addresses the question.\n- citationCorrectness: number from 0 to 1. 1 means citations map to retrieved context and support the answer.\n- passed: boolean. True only if faithfulness >= 0.8, relevance >= 0.8, and citationCorrectness >= 0.8.\n- rationale: concise explanation of the score.\n\nReturn JSON shape exactly:\n{"faithfulness": number, "relevance": number, "citationCorrectness": number, "passed": boolean, "rationale": string}`,
});

export const judgeRagEvalResults = async ({
  results,
  judgeClient,
}: JudgeRagEvalResultsInput): Promise<JudgedRagEvalResult[]> => {
  const judged: JudgedRagEvalResult[] = [];

  for (const result of results) {
    const rawJudgeScore = await judgeClient.answer(buildJudgePrompt(result));
    judged.push({
      ...result,
      judge: parseJudgeScore(rawJudgeScore),
    });
  }

  return judged;
};

const average = (values: number[]): number => {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
};

export const summarizeJudgeResults = (results: JudgedRagEvalResult[]): JudgeEvalSummary => {
  const passed = results.filter((result) => result.judge.passed).length;

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    averages: {
      faithfulness: average(results.map((result) => result.judge.faithfulness)),
      relevance: average(results.map((result) => result.judge.relevance)),
      citationCorrectness: average(results.map((result) => result.judge.citationCorrectness)),
    },
  };
};
