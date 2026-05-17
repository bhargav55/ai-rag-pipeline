import { OpenAIEmbeddingClient } from "../embeddings/openai";
import { OpenAIChatClient } from "../llm/openai-chat";
import { answerWithRag } from "../rag";
import { createLoggerTracer } from "../rag-tracing";
import { QdrantVectorStore } from "../stores/qdrant-vector-store";
import type { VectorSearchStore } from "../types";

type AskStore = {
  name: "qdrant";
  store: VectorSearchStore;
  close(): Promise<void>;
};

const embeddingDimension = () => Number(Bun.env.EMBEDDING_DIMENSION ?? "1536");

const createStore = (): AskStore => {
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
  const [question, topKArg] = Bun.argv.slice(2);
  if (!question) {
    console.error("Usage: bun run ask <question> [topK]");
    process.exit(1);
  }

  const { store, close, name } = createStore();
  const response = await answerWithRag({
    question,
    embeddingClient: new OpenAIEmbeddingClient(),
    store,
    llmClient: new OpenAIChatClient(),
    topK: topKArg ? Number(topKArg) : 3,
    trace: createLoggerTracer({ model: Bun.env.CHAT_MODEL ?? "gpt-5.5" }),
  });
  await close();

  console.log(JSON.stringify({ store: name, ...response }, null, 2));
};

await main();
