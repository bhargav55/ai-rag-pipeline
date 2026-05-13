import { describe, expect, it } from "vitest";
import { InMemoryVectorStore } from "../src/vector-store";
import type { EmbeddedChunk } from "../src/types";

const chunk = (id: string, embedding: number[], text = id): EmbeddedChunk => ({
  id,
  sourcePath: `${id}.md`,
  domain: "perps",
  index: 0,
  text,
  embedding,
});

describe("InMemoryVectorStore", () => {
  it("returns top-k chunks by cosine similarity", () => {
    const store = new InMemoryVectorStore();
    store.addMany([
      chunk("funding", [1, 0], "funding rates and mark price"),
      chunk("oracle", [0, 1], "oracle freshness and confidence"),
      chunk("margin", [0.8, 0.2], "margin and collateral"),
    ]);

    expect(store.search([1, 0], 2)).toEqual([
      expect.objectContaining({
        chunk: expect.objectContaining({ id: "funding" }),
        score: 1,
      }),
      expect.objectContaining({
        chunk: expect.objectContaining({ id: "margin" }),
      }),
    ]);
  });

  it("rejects vectors with mismatched dimensions", () => {
    const store = new InMemoryVectorStore();
    store.addMany([chunk("funding", [1, 0])]);

    expect(() => store.search([1], 1)).toThrow("Embedding dimension mismatch");
  });
});
