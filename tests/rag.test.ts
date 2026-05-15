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
    headingPath: ["Risk", "Liquidation"],
    embedding: [1, 0],
  },
};

const store: VectorSearchStore = {
  async search() {
    return [searchResult];
  },
};

describe("answerWithRag", () => {
  it("retrieves context, builds prompt, validates structured LLM output, and returns sources", async () => {
    const seenPrompts: Array<{ system: string; user: string }> = [];
    const llmClient: LlmClient = {
      async answer(prompt) {
        seenPrompts.push(prompt);
        return JSON.stringify({
          answer: "Liquidation happens below maintenance margin [1].",
          confidence: "high",
          citations: [{ sourceNumber: 1 }],
          missingContext: false,
        });
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
      confidence: "high",
      citations: [{ sourceNumber: 1 }],
      missingContext: false,
      sources: [{ sourcePath: "risk/liquidation.md", chunkId: "risk/liquidation.md#chunk-0", score: 0.95 }],
    });

    expect(seenPrompts[0].user).toContain("When does liquidation happen?");
    expect(seenPrompts[0].user).toContain("Liquidation happens below maintenance margin.");
    expect(seenPrompts[0].user).toContain("Return only valid JSON");
  });

  it("emits a structured trace with timings and retrieved chunk metadata", async () => {
    const traceEvents: unknown[] = [];
    const nowValues = [1000, 1011, 1037, 1042, 1085, 1091];
    const llmClient: LlmClient = {
      async answer() {
        return JSON.stringify({
          answer: "Liquidation happens below maintenance margin [1].",
          confidence: "high",
          citations: [{ sourceNumber: 1 }],
          missingContext: false,
        });
      },
    };

    const response = await answerWithRag({
      question: "When does liquidation happen?",
      embeddingClient,
      store,
      llmClient,
      topK: 1,
      trace: {
        requestId: "req-test-1",
        model: "gpt-5.5",
        nowMs: () => nowValues.shift() ?? 1091,
        log: (event) => traceEvents.push(event),
      },
    });

    expect(response.traceId).toBe("req-test-1");
    expect(traceEvents).toEqual([
      {
        event: "rag.answer.completed",
        requestId: "req-test-1",
        question: "When does liquidation happen?",
        topK: 1,
        model: "gpt-5.5",
        retrievedChunks: [
          {
            chunkId: "risk/liquidation.md#chunk-0",
            sourcePath: "risk/liquidation.md",
            headingPath: ["Risk", "Liquidation"],
            score: 0.95,
          },
        ],
        timingsMs: {
          embedding: 11,
          vectorSearch: 26,
          promptBuild: 5,
          llm: 43,
          validation: 6,
          total: 91,
        },
      },
    ]);
  });

  it("emits a structured error trace when answer generation fails", async () => {
    const traceEvents: unknown[] = [];
    const nowValues = [2000, 2005, 2010, 2013, 2020];
    const llmClient: LlmClient = {
      async answer() {
        throw new Error("LLM unavailable");
      },
    };

    await expect(
      answerWithRag({
        question: "When does liquidation happen?",
        embeddingClient,
        store,
        llmClient,
        topK: 1,
        trace: {
          requestId: "req-error-1",
          model: "gpt-5.5",
          nowMs: () => nowValues.shift() ?? 2020,
          log: (event) => traceEvents.push(event),
        },
      }),
    ).rejects.toThrow("LLM unavailable");

    expect(traceEvents).toEqual([
      {
        event: "rag.answer.failed",
        requestId: "req-error-1",
        question: "When does liquidation happen?",
        topK: 1,
        model: "gpt-5.5",
        retrievedChunks: [
          {
            chunkId: "risk/liquidation.md#chunk-0",
            sourcePath: "risk/liquidation.md",
            headingPath: ["Risk", "Liquidation"],
            score: 0.95,
          },
        ],
        timingsMs: {
          embedding: 5,
          vectorSearch: 5,
          promptBuild: 3,
          llm: 7,
          validation: 0,
          total: 20,
        },
        error: {
          name: "Error",
          message: "LLM unavailable",
        },
      },
    ]);
  });
});
