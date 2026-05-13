import { describe, expect, it } from "vitest";
import { buildRetrievalIndex, retrieve } from "../src/retriever";
import type { Chunk, EmbeddingClient } from "../src/types";

const chunks: Chunk[] = [
  {
    id: "perps/funding.md#chunk-0",
    sourcePath: "perps/funding.md",
    domain: "perps",
    index: 0,
    text: "funding rates align perp and spot prices",
  },
  {
    id: "risk/oracle.txt#chunk-0",
    sourcePath: "risk/oracle.txt",
    domain: "risk",
    index: 0,
    text: "oracle freshness and confidence bounds",
  },
];

const embeddingClient: EmbeddingClient = {
  async embed(input: string[]) {
    return input.map((text) => {
      if (text.includes("funding")) return [1, 0];
      if (text.includes("oracle")) return [0, 1];
      return [0.7, 0.3];
    });
  },
};

describe("retriever", () => {
  it("embeds chunks, indexes them, and retrieves relevant context for a query", async () => {
    const index = await buildRetrievalIndex(chunks, embeddingClient);

    await expect(retrieve(index, embeddingClient, "how do funding rates work?", 1)).resolves.toEqual([
      expect.objectContaining({
        chunk: expect.objectContaining({ sourcePath: "perps/funding.md" }),
        score: 1,
      }),
    ]);
  });
});
