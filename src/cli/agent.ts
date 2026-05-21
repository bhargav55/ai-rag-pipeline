import { OpenAIEmbeddingClient } from "../embeddings/openai";
import { OpenAIChatClient } from "../llm/openai-chat";
import { runProtocolKnowledgeAgent } from "../protocol-agent";
import { QdrantVectorStore } from "../stores/qdrant-vector-store";
import type { VectorSearchStore } from "../types";

type AgentStore = {
  name: "qdrant";
  store: VectorSearchStore;
  close(): Promise<void>;
};

const embeddingDimension = () => Number(Bun.env.EMBEDDING_DIMENSION ?? "1536");

const createStore = (): AgentStore => {
  const vectorStore = Bun.env.VECTOR_STORE ?? "qdrant";
  if (vectorStore !== "qdrant") {
    throw new Error(`Unsupported VECTOR_STORE: ${vectorStore}. Use qdrant.`);
  }

  return {
    name: "qdrant",
    store: new QdrantVectorStore({
      url: Bun.env.QDRANT_URL ?? "http://localhost:6333",
      collection: Bun.env.QDRANT_COLLECTION ?? "protocol_docs",
      dimension: embeddingDimension(),
      apiKey: Bun.env.QDRANT_API_KEY,
    }),
    close: async () => {},
  };
};

const main = async () => {
  const [question, topKArg, maxSearchQueriesArg] = Bun.argv.slice(2);
  if (!question) {
    console.error("Usage: bun run agent <question> [topK] [maxSearchQueries]");
    process.exit(1);
  }

  const { store, close, name } = createStore();
  try {
    const response = await runProtocolKnowledgeAgent({
      question,
      embeddingClient: new OpenAIEmbeddingClient(),
      store,
      llmClient: new OpenAIChatClient(),
      topK: topKArg ? Number(topKArg) : 4,
      maxSearchQueries: maxSearchQueriesArg ? Number(maxSearchQueriesArg) : 3,
    });

    console.log(JSON.stringify({ store: name, ...response }, null, 2));
  } finally {
    await close();
  }
};

await main();
