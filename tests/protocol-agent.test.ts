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
  it("lets the model call retrieval as a registered tool, then returns a grounded final answer", async () => {
    const prompts: Array<{ system: string; user: string }> = [];
    const llmClient: LlmClient = {
      async answer(prompt) {
        prompts.push(prompt);
        if (prompts.length === 1) {
          return JSON.stringify({
            action: "tool_call",
            reasoning: "Need protocol and signer-safety docs before answering.",
            toolName: "retrieve_protocol_context",
            toolInput: {
              query: "liquidation agent signer safety allowlists",
              topK: 2,
            },
          });
        }

        return JSON.stringify({
          action: "final_answer",
          reasoning: "The retrieved evidence covers both liquidation jobs and signer safety.",
          finalAnswer: {
            answer:
              "Agents discover liquidation jobs and settle them on-chain [1]. Signer safety uses allowlists, value caps, and rate limits [2].",
            confidence: "high",
            citations: [{ sourceNumber: 1 }, { sourceNumber: 2 }],
            missingContext: false,
            missingDocs: [],
            nextActions: ["Keep signer safety docs updated when new handlers are added."],
          },
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
      topK: 4,
      maxTurns: 3,
    });

    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls[0]).toMatchObject({
      turn: 1,
      toolName: "retrieve_protocol_context",
      toolInput: {
        query: "liquidation agent signer safety allowlists",
        topK: 2,
      },
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
    expect(prompts[0].user).toContain("retrieve_protocol_context");
    expect(prompts[1].user).toContain("Numbered evidence available for final answers");
    expect(prompts[1].user).toContain("[2] Source: protocol/signer-safety.md");
  });

  it("can return a missing-context final answer without retrieval", async () => {
    const llmClient: LlmClient = {
      async answer() {
        return JSON.stringify({
          action: "final_answer",
          reasoning: "The question is too ambiguous to retrieve useful context.",
          finalAnswer: {
            answer: "Which protocol docs should I use?",
            confidence: "low",
            citations: [],
            missingContext: true,
            missingDocs: ["which protocol or docs set"],
            nextActions: ["Clarify the protocol or provide the relevant docs."],
          },
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
