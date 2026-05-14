import { answerWithRag } from "./rag";
import type { EmbeddingClient, LlmClient, VectorSearchStore } from "./types";

export type RagEvalCase = {
  id: string;
  question: string;
  expectedSources: string[];
  mustMention: string[];
};

export type RagEvalResult = {
  id: string;
  question: string;
  passed: boolean;
  retrievalPassed: boolean;
  answerPassed: boolean;
  expectedSources: string[];
  actualSources: string[];
  missingSources: string[];
  mustMention: string[];
  missingTerms: string[];
  answer: string;
};

export type RagEvalSummary = {
  total: number;
  passed: number;
  failed: number;
};

type EvaluateRagInput = {
  cases: RagEvalCase[];
  topK: number;
  embeddingClient: EmbeddingClient;
  store: VectorSearchStore;
  llmClient: LlmClient;
};

const includesTerm = (answer: string, term: string) => answer.toLowerCase().includes(term.toLowerCase());

export const evaluateRag = async ({
  cases,
  topK,
  embeddingClient,
  store,
  llmClient,
}: EvaluateRagInput): Promise<RagEvalResult[]> => {
  const results: RagEvalResult[] = [];

  for (const evalCase of cases) {
    const response = await answerWithRag({
      question: evalCase.question,
      embeddingClient,
      store,
      llmClient,
      topK,
    });

    const actualSources = [...new Set(response.sources.map((source) => source.sourcePath))];
    const missingSources = evalCase.expectedSources.filter((source) => !actualSources.includes(source));
    const missingTerms = evalCase.mustMention.filter((term) => !includesTerm(response.answer, term));
    const retrievalPassed = missingSources.length === 0;
    const answerPassed = missingTerms.length === 0;

    results.push({
      id: evalCase.id,
      question: evalCase.question,
      passed: retrievalPassed && answerPassed,
      retrievalPassed,
      answerPassed,
      expectedSources: evalCase.expectedSources,
      actualSources,
      missingSources,
      mustMention: evalCase.mustMention,
      missingTerms,
      answer: response.answer,
    });
  }

  return results;
};

export const summarizeEvalResults = (results: RagEvalResult[]): RagEvalSummary => {
  const passed = results.filter((result) => result.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
  };
};
