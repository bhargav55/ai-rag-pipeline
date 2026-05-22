import { z } from "zod";
import type { EmbeddingClient, SearchResult, VectorSearchStore } from "../../types";
import type { AgentToolDefinition } from "../tool";

export type RetrievedProtocolChunk = {
  sourcePath: string;
  chunkId: string;
  score: number;
  headingPath?: string[];
  text: string;
};

export type RetrieveProtocolContextResult = {
  query: string;
  chunks: RetrievedProtocolChunk[];
  rawResults: SearchResult[];
};

type CreateRetrieveProtocolContextToolInput = {
  embeddingClient: EmbeddingClient;
  store: VectorSearchStore;
  defaultTopK?: number;
};

export const createRetrieveProtocolContextTool = ({
  embeddingClient,
  store,
  defaultTopK = 4,
}: CreateRetrieveProtocolContextToolInput): AgentToolDefinition => {
  const inputSchema = z.object({
    query: z.string().min(1),
    topK: z.number().int().min(1).max(10).default(defaultTopK),
  });

  return {
    name: "retrieve_protocol_context",
    description:
      "Search indexed protocol, architecture, and engineering documentation. Use this before answering protocol-specific questions.",
    inputSchema,
    async execute(input) {
      const { query, topK } = inputSchema.parse(input);
      const [embedding] = await embeddingClient.embed([query]);
      const rawResults = await store.search(embedding, topK);

      return {
        query,
        rawResults,
        chunks: rawResults.map(({ chunk, score }) => ({
          sourcePath: chunk.sourcePath,
          chunkId: chunk.id,
          score,
          headingPath: chunk.headingPath,
          text: chunk.text,
        })),
      } satisfies RetrieveProtocolContextResult;
    },
  };
};
