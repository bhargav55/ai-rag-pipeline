import { runAgent, type AgentRunnerResponse } from "./agent/runner";
import { createRetrieveProtocolContextTool } from "./agent/tools/retrieve-protocol-context";
import { ToolRegistry } from "./agent/tool";
import type { EmbeddingClient, LlmClient, VectorSearchStore } from "./types";

export type ProtocolKnowledgeAgentInput = {
  question: string;
  embeddingClient: EmbeddingClient;
  store: VectorSearchStore;
  llmClient: LlmClient;
  topK?: number;
  maxTurns?: number;
};

export type ProtocolKnowledgeAgentResponse = AgentRunnerResponse;

export const runProtocolKnowledgeAgent = async ({
  question,
  embeddingClient,
  store,
  llmClient,
  topK = 4,
  maxTurns = 6,
}: ProtocolKnowledgeAgentInput): Promise<ProtocolKnowledgeAgentResponse> => {
  const tools = new ToolRegistry([
    createRetrieveProtocolContextTool({
      embeddingClient,
      store,
      defaultTopK: topK,
    }),
  ]);

  return runAgent({
    question,
    llmClient,
    tools,
    maxTurns,
  });
};
