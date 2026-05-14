import { buildRagPrompt } from "./prompt";
import type { EmbeddingClient, LlmClient, VectorSearchStore } from "./types";

type AnswerWithRagInput = {
  question: string;
  embeddingClient: EmbeddingClient;
  store: VectorSearchStore;
  llmClient: LlmClient;
  topK: number;
};

export const answerWithRag = async ({
  question,
  embeddingClient,
  store,
  llmClient,
  topK,
}: AnswerWithRagInput) => {
  const [queryEmbedding] = await embeddingClient.embed([question]);
  const results = await store.search(queryEmbedding, topK);
  const prompt = buildRagPrompt({ question, results });
  const answer = await llmClient.answer(prompt);

  return {
    answer,
    sources: results.map(({ chunk, score }) => ({
      sourcePath: chunk.sourcePath,
      chunkId: chunk.id,
      score,
    })),
  };
};
