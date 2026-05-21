import { describe, expect, it } from "vitest";
import { runProtocolKnowledgeAgent } from "../src/protocol-agent";
import type { EmbeddingClient, LlmClient, SearchResult, VectorSearchStore } from "../src/types";

const embeddingClient: EmbeddingClient = {
  async embed(input: string[]) {
    return input.map((value) => [value.length, 1]);
  },
};

const liquidationChunk: SearchResult = {
  score: 0.92,
  chunk: {
    id: "protocol/liquidations.md#0",
    sourcePath: "protocol/liquidations.md",
    domain: "protocol",
    index: 0,
    headingPath: ["Liquidations"],
    text: "Liquidation jobs are discovered by agents and settled on-chain.",
    embedding: [1, 1],
  },
};

const signerSafetyChunk: SearchResult = {
  score: 0.88,
  chunk: {
    id: "protocol/signer-safety.md#0",
    sourcePath: "protocol/signer-safety.md",
    domain: "protocol",
    index: 0,
    headingPath: ["Signer Safety"],
    text: "Signer safety uses destination allowlists, selector allowlists, value caps, and rate limits.",
    embedding: [1, 1],
  },
};

describe("runProtocolKnowledgeAgent", () => {
  it("plans retrieval, calls the retrieval tool, dedupes evidence, and returns a grounded answer", async () => {
    const prompts: Array<{ system: string; user: string }> = [];
    const llmClient: LlmClient = {
      async answer(prompt) {
        prompts.push(prompt);
        if (prompts.length === 1) {
          return JSON.stringify({
            intent: "Explain agent liquidation safety.",
            searchQueries: ["liquidation agent jobs", "signer safety allowlists"],
            requiredContext: ["agent job execution docs", "signer safety docs"],
            needsClarification: false,
          });
        }

        return JSON.stringify({
          answer:
            "Agents discover liquidation jobs and settle them on-chain [1]. Signer safety uses allowlists, value caps, and rate limits [2].",
          confidence: "high",
          citations: [{ sourceNumber: 1 }, { sourceNumber: 2 }],
          missingContext: false,
          missingDocs: [],
          nextActions: ["Keep signer safety docs updated when new handlers are added."],
        });
      },
    };

    const store: VectorSearchStore = {
      async search(_queryEmbedding, topK) {
        expect(topK).toBe(2);
        return [liquidationChunk, signerSafetyChunk, liquidationChunk];
      },
    };

    const response = await runProtocolKnowledgeAgent({
      question: "How do liquidation agents stay safe?",
      embeddingClient,
      store,
      llmClient,
      topK: 2,
      maxSearchQueries: 2,
    });

    expect(response.plan.searchQueries).toEqual(["liquidation agent jobs", "signer safety allowlists"]);
    expect(response.toolCalls).toHaveLength(2);
    expect(response.toolCalls[0]).toMatchObject({
      tool: "retrieve_protocol_context",
      query: "liquidation agent jobs",
      topK: 2,
    });
    expect(response.sources).toEqual([
      {
        sourceNumber: 1,
        sourcePath: "protocol/liquidations.md",
        chunkId: "protocol/liquidations.md#0",
        score: 0.92,
        headingPath: ["Liquidations"],
      },
      {
        sourceNumber: 2,
        sourcePath: "protocol/signer-safety.md",
        chunkId: "protocol/signer-safety.md#0",
        score: 0.88,
        headingPath: ["Signer Safety"],
      },
    ]);
    expect(response.answer).toContain("settle them on-chain [1]");
    expect(prompts[1].user).toContain("Retrieved evidence");
    expect(prompts[1].user).toContain("Signer safety uses destination allowlists");
  });

  it("returns a clarification response without retrieval when the plan requires clarification", async () => {
    const llmClient: LlmClient = {
      async answer() {
        return JSON.stringify({
          intent: "Clarify ambiguous protocol reference.",
          searchQueries: ["unknown protocol"],
          requiredContext: ["which protocol or docs set"],
          needsClarification: true,
          clarifyingQuestion: "Which protocol docs should I use?",
        });
      },
    };

    const store: VectorSearchStore = {
      async search() {
        throw new Error("retrieval should not run");
      },
    };

    await expect(
      runProtocolKnowledgeAgent({
        question: "How does it work?",
        embeddingClient,
        store,
        llmClient,
      }),
    ).resolves.toMatchObject({
      answer: "Which protocol docs should I use?",
      confidence: "low",
      missingContext: true,
      missingDocs: ["which protocol or docs set"],
      toolCalls: [],
      sources: [],
    });
  });
});
