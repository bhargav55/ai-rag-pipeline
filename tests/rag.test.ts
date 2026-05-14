import { describe, expect, it } from "vitest";
import { answerWithRag } from "../src/rag";
import type { EmbeddingClient, LlmClient, SearchResult, VectorSearchStore } from "../src/types";

const embeddingClient: EmbeddingClient = {
  async embed(input: string[]) {
    return input.map(() => [1, 0]);
  },
};

const searchResult: SearchResult = {
  score: 0.95,
  chunk: {
    id: "risk/liquidation.md#chunk-0",
    sourcePath: "risk/liquidation.md",
    domain: "risk",
    index: 0,
    text: "Liquidation happens below maintenance margin.",
    embedding: [1, 0],
  },
};

const store: VectorSearchStore = {
  async search() {
    return [searchResult];
  },
};

describe("answerWithRag", () => {
  it("retrieves context, builds prompt, and returns LLM answer with sources", async () => {
    const seenPrompts: Array<{ system: string; user: string }> = [];
    const llmClient: LlmClient = {
      async answer(prompt) {
        seenPrompts.push(prompt);
        return "Liquidation happens below maintenance margin [1].";
      },
    };

    await expect(
      answerWithRag({
        question: "When does liquidation happen?",
        embeddingClient,
        store,
        llmClient,
        topK: 1,
      }),
    ).resolves.toEqual({
      answer: "Liquidation happens below maintenance margin [1].",
      sources: [{ sourcePath: "risk/liquidation.md", chunkId: "risk/liquidation.md#chunk-0", score: 0.95 }],
    });

    expect(seenPrompts[0].user).toContain("When does liquidation happen?");
    expect(seenPrompts[0].user).toContain("Liquidation happens below maintenance margin.");
  });
});
