import { buildRagPrompt } from "./prompt";
import type { EmbeddingClient, LlmClient, VectorSearchStore } from "./types";

export type RagEvalCase = {
  id: string;
  question: string;
  expectedSources: string[];
  mustMention: string[];
  reference?: string;
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
  contexts: string[];
  reference?: string;
};

export type RagEvalSummary = {
  total: number;
  passed: number;
  failed: number;
};

export type RagasRow = {
  id: string;
  user_input: string;
  response: string;
  retrieved_contexts: string[];
  reference: string;
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
    const [queryEmbedding] = await embeddingClient.embed([evalCase.question]);
    const searchResults = await store.search(queryEmbedding, topK);
    const prompt = buildRagPrompt({ question: evalCase.question, results: searchResults });
    const answer = await llmClient.answer(prompt);

    const actualSources = [...new Set(searchResults.map((result) => result.chunk.sourcePath))];
    const missingSources = evalCase.expectedSources.filter((source) => !actualSources.includes(source));
    const missingTerms = evalCase.mustMention.filter((term) => !includesTerm(answer, term));
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
      answer,
      contexts: searchResults.map((result) => result.chunk.text),
      reference: evalCase.reference,
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

export const toRagasRows = (results: RagEvalResult[]): RagasRow[] =>
  results.map((result) => {
    if (!result.reference) {
      throw new Error(`Eval case ${result.id} is missing reference answer required for Ragas`);
    }

    return {
      id: result.id,
      user_input: result.question,
      response: result.answer,
      retrieved_contexts: result.contexts,
      reference: result.reference,
    };
  });
