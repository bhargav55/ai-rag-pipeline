import { runAgent, type AgentRunnerResponse } from "./agent/runner";
import { createRetrieveProtocolContextTool } from "./agent/tools/retrieve-protocol-context";
import { ToolRegistry } from "./agent/tool";
import type { EmbeddingClient, LlmClient, SearchFilter, VectorSearchStore } from "./types";

export type ProtocolKnowledgeAgentInput = {
  question: string;
  embeddingClient: EmbeddingClient;
  store: VectorSearchStore;
  llmClient: LlmClient;
  topK?: number;
  maxTurns?: number;
  filter?: SearchFilter;
};

export type ProtocolKnowledgeAgentResponse = AgentRunnerResponse;

export const runProtocolKnowledgeAgent = async ({
  question,
  embeddingClient,
  store,
  llmClient,
  topK = 4,
  maxTurns = 6,
  filter,
}: ProtocolKnowledgeAgentInput): Promise<ProtocolKnowledgeAgentResponse> => {
  const tools = new ToolRegistry([
    createRetrieveProtocolContextTool({
      embeddingClient,
      store,
      defaultTopK: topK,
      filter,
    }),
  ]);

  return runAgent({
    question,
    llmClient,
    tools,
    maxTurns,
  });
};
