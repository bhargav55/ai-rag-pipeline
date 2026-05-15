import { buildRagPrompt } from "./prompt";
import { parseStructuredRagAnswer } from "./structured-answer";
import type { EmbeddingClient, LlmClient, RagTraceTimings, RagTracer, SearchResult, VectorSearchStore } from "./types";

const defaultNowMs = (): number => performance.now();

const elapsed = (start: number, end: number): number => Math.round(end - start);

const toRetrievedChunkTrace = (results: SearchResult[]) =>
  results.map(({ chunk, score }) => ({
    chunkId: chunk.id,
    sourcePath: chunk.sourcePath,
    headingPath: chunk.headingPath,
    score,
  }));

const toErrorTrace = (error: unknown) => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }

  return { name: "Error", message: String(error) };
};

type AnswerWithRagInput = {
  question: string;
  embeddingClient: EmbeddingClient;
  store: VectorSearchStore;
  llmClient: LlmClient;
  topK: number;
  trace?: RagTracer;
};

export const answerWithRag = async ({
  question,
  embeddingClient,
  store,
  llmClient,
  topK,
  trace,
}: AnswerWithRagInput) => {
  const nowMs = trace?.nowMs ?? defaultNowMs;
  const requestId = trace?.requestId ?? crypto.randomUUID();
  const startedAt = nowMs();
  const timings: RagTraceTimings = {
    embedding: 0,
    vectorSearch: 0,
    promptBuild: 0,
    llm: 0,
    validation: 0,
    total: 0,
  };
  let stageStartedAt = startedAt;
  let activeStage: keyof Omit<RagTraceTimings, "total"> = "embedding";
  let results: SearchResult[] = [];

  const finishStage = (stage: keyof Omit<RagTraceTimings, "total">): number => {
    const finishedAt = nowMs();
    timings[stage] = elapsed(stageStartedAt, finishedAt);
    stageStartedAt = finishedAt;
    return finishedAt;
  };

  const finishTrace = (finishedAt = stageStartedAt): RagTraceTimings => ({
    ...timings,
    total: elapsed(startedAt, finishedAt),
  });

  try {
    activeStage = "embedding";
    const [queryEmbedding] = await embeddingClient.embed([question]);
    finishStage("embedding");

    activeStage = "vectorSearch";
    results = await store.search(queryEmbedding, topK);
    finishStage("vectorSearch");

    activeStage = "promptBuild";
    const prompt = buildRagPrompt({ question, results });
    finishStage("promptBuild");

    activeStage = "llm";
    const rawAnswer = await llmClient.answer(prompt);
    finishStage("llm");

    activeStage = "validation";
    const structuredAnswer = parseStructuredRagAnswer(rawAnswer);
    const validationDoneAt = finishStage("validation");

    trace?.log({
      event: "rag.answer.completed",
      requestId,
      question,
      topK,
      model: trace.model,
      retrievedChunks: toRetrievedChunkTrace(results),
      timingsMs: finishTrace(validationDoneAt),
    });

    return {
      ...structuredAnswer,
      traceId: trace ? requestId : undefined,
      sources: results.map(({ chunk, score }) => ({
        sourcePath: chunk.sourcePath,
        chunkId: chunk.id,
        score,
      })),
    };
  } catch (error) {
    const failedAt = nowMs();
    timings[activeStage] = elapsed(stageStartedAt, failedAt);

    trace?.log({
      event: "rag.answer.failed",
      requestId,
      question,
      topK,
      model: trace.model,
      retrievedChunks: toRetrievedChunkTrace(results),
      timingsMs: finishTrace(failedAt),
      error: toErrorTrace(error),
    });

    throw error;
  }
};
