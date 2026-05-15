import postgres from "postgres";
import { OpenAIEmbeddingClient } from "../embeddings/openai";
import { handleHttpRequest } from "../http-server";
import { OpenAIChatClient } from "../llm/openai-chat";
import { answerWithRag } from "../rag";
import { createLoggerTracer } from "../rag-tracing";
import { PgVectorStore } from "../stores/pg-vector-store";
import { QdrantVectorStore } from "../stores/qdrant-vector-store";
import type { VectorSearchStore } from "../types";

type ServerStore = {
  name: "qdrant" | "pgvector";
  store: VectorSearchStore;
  close(): Promise<void>;
};

const embeddingDimension = () => Number(Bun.env.EMBEDDING_DIMENSION ?? "1536");

const createStore = (): ServerStore => {
  const vectorStore = Bun.env.VECTOR_STORE ?? "qdrant";

  if (vectorStore === "pgvector") {
    if (!Bun.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when VECTOR_STORE=pgvector");
    }
    const db = postgres(Bun.env.DATABASE_URL);
    return {
      name: "pgvector",
      store: new PgVectorStore(db),
      close: () => db.end(),
    };
  }

  if (vectorStore !== "qdrant") {
    throw new Error(`Unsupported VECTOR_STORE: ${vectorStore}. Use qdrant or pgvector.`);
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

const port = Number(Bun.env.PORT ?? "3000");

Bun.serve({
  port,
  async fetch(request) {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    return handleHttpRequest(request, {
      async answer({ question, topK }) {
        const { store, close, name } = createStore();
        try {
          const response = await answerWithRag({
            question,
            embeddingClient: new OpenAIEmbeddingClient(),
            store,
            llmClient: new OpenAIChatClient(),
            topK,
            trace: createLoggerTracer({ requestId, model: Bun.env.CHAT_MODEL ?? "gpt-5.5" }),
          });

          return { store: name, ...response };
        } finally {
          await close();
        }
      },
    });
  },
});

console.log(`RAG API listening on http://localhost:${port}`);
