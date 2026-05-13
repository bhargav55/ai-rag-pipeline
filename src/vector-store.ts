import type { EmbeddedChunk, SearchResult } from "./types";

const dot = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const magnitude = (vector: number[]) => Math.sqrt(dot(vector, vector));

export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimension mismatch: ${a.length} !== ${b.length}`);
  }

  const denominator = magnitude(a) * magnitude(b);
  if (denominator === 0) return 0;
  return dot(a, b) / denominator;
};

export class InMemoryVectorStore {
  private chunks: EmbeddedChunk[] = [];

  addMany(chunks: EmbeddedChunk[]): void {
    this.chunks.push(...chunks);
  }

  search(queryEmbedding: number[], topK: number): SearchResult[] {
    return this.chunks
      .map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
