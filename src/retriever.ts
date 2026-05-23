import type { Chunk, EmbeddedChunk, EmbeddingClient, SearchFilter, SearchResult } from "./types";
import { InMemoryVectorStore } from "./vector-store";

export type RetrievalIndex = {
  store: InMemoryVectorStore;
  chunks: EmbeddedChunk[];
};

export const buildRetrievalIndex = async (
  chunks: Chunk[],
  embeddingClient: EmbeddingClient,
): Promise<RetrievalIndex> => {
  const embeddings = await embeddingClient.embed(chunks.map((chunk) => chunk.text));
  const embeddedChunks = chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index],
  }));

  const store = new InMemoryVectorStore();
  store.addMany(embeddedChunks);

  return { store, chunks: embeddedChunks };
};

export const retrieve = async (
  index: RetrievalIndex,
  embeddingClient: EmbeddingClient,
  query: string,
  topK: number,
  filter?: SearchFilter,
): Promise<SearchResult[]> => {
  const [queryEmbedding] = await embeddingClient.embed([query]);
  return index.store.search(queryEmbedding, topK, filter);
};
