import { z } from "zod";
import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agent/runner";
import { ToolRegistry } from "../src/agent/tool";
import type { LlmClient, SearchResult } from "../src/types";

const createEchoTools = () =>
  new ToolRegistry([
    {
      name: "echo",
      description: "Echo a message for tests.",
      inputSchema: z.object({ message: z.string().min(1) }),
      async execute(input) {
        const { message } = z.object({ message: z.string() }).parse(input);
        return { message };
      },
    },
  ]);

const evidenceResult: SearchResult = {
  score: 0.9,
  chunk: {
    id: "protocol/evidence.md#0",
    sourcePath: "protocol/evidence.md",
    domain: "protocol",
    index: 0,
    text: "Evidence-backed answer content.",
    embedding: [1, 1],
  },
};

const createEvidenceTools = () =>
  new ToolRegistry([
    {
      name: "search_docs",
      description: "Search docs for tests.",
      inputSchema: z.object({ query: z.string().min(1) }),
      async execute() {
        return {
          query: "evidence",
          rawResults: [evidenceResult],
          chunks: [
            {
              sourcePath: evidenceResult.chunk.sourcePath,
              chunkId: evidenceResult.chunk.id,
              score: evidenceResult.score,
              text: evidenceResult.chunk.text,
            },
          ],
        };
      },
    },
  ]);

describe("runAgent", () => {
  it("rejects unknown tools requested by the model", async () => {
    const llmClient: LlmClient = {
      async answer() {
        return JSON.stringify({
          action: "tool_call",
          reasoning: "Need a missing tool.",
          toolName: "missing_tool",
          toolInput: {},
        });
      },
    };

    await expect(
      runAgent({
        question: "test",
        llmClient,
        tools: createEchoTools(),
      }),
    ).rejects.toThrow("Model requested unknown tool: missing_tool");
  });

  it("validates tool inputs before execution", async () => {
    const llmClient: LlmClient = {
      async answer() {
        return JSON.stringify({
          action: "tool_call",
          reasoning: "Call echo with invalid args.",
          toolName: "echo",
          toolInput: { message: "" },
        });
      },
    };

    await expect(
      runAgent({
        question: "test",
        llmClient,
        tools: createEchoTools(),
      }),
    ).rejects.toThrow();
  });

  it("stops when maxTurns is reached without a final answer", async () => {
    const llmClient: LlmClient = {
      async answer() {
        return JSON.stringify({
          action: "tool_call",
          reasoning: "Keep looping.",
          toolName: "echo",
          toolInput: { message: "again" },
        });
      },
    };

    await expect(
      runAgent({
        question: "test",
        llmClient,
        tools: createEchoTools(),
        maxTurns: 2,
      }),
    ).rejects.toThrow("Agent exceeded maxTurns=2 without producing a final answer");
  });

  it("requires missingContext when final answer has no evidence", async () => {
    const llmClient: LlmClient = {
      async answer() {
        return JSON.stringify({
          action: "final_answer",
          reasoning: "No tool needed.",
          finalAnswer: {
            answer: "This is unsupported.",
            confidence: "high",
            citations: [],
            missingContext: false,
            missingDocs: [],
            nextActions: [],
          },
        });
      },
    };

    await expect(
      runAgent({
        question: "test",
        llmClient,
        tools: createEchoTools(),
      }),
    ).rejects.toThrow("Final answer must set missingContext=true when no evidence was retrieved");
  });

  it("requires citations when evidence is available and missingContext=false", async () => {
    let calls = 0;
    const llmClient: LlmClient = {
      async answer() {
        calls += 1;
        if (calls === 1) {
          return JSON.stringify({
            action: "tool_call",
            reasoning: "Need evidence first.",
            toolName: "search_docs",
            toolInput: { query: "evidence" },
          });
        }

        return JSON.stringify({
          action: "final_answer",
          reasoning: "Evidence was retrieved.",
          finalAnswer: {
            answer: "This answer forgot citations.",
            confidence: "medium",
            citations: [],
            missingContext: false,
            missingDocs: [],
            nextActions: [],
          },
        });
      },
    };

    await expect(
      runAgent({
        question: "test",
        llmClient,
        tools: createEvidenceTools(),
        maxTurns: 2,
      }),
    ).rejects.toThrow("Final answer must cite at least one retrieved source when missingContext=false");
  });
});
