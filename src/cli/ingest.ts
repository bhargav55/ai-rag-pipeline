import postgres from "postgres";
import { OpenAIEmbeddingClient } from "../embeddings/openai";
import { loadDocuments } from "../loader";
import { chunkMarkdownDocument } from "../markdown-section-chunker";
import { PgVectorStore } from "../stores/pg-vector-store";
import { QdrantVectorStore } from "../stores/qdrant-vector-store";
import type { EmbeddedChunk } from "../types";

type IngestStore = {
  name: "qdrant" | "pgvector";
  upsertMany(chunks: EmbeddedChunk[]): Promise<void>;
  close(): Promise<void>;
};

const embeddingDimension = () => Number(Bun.env.EMBEDDING_DIMENSION ?? "1536");

const createStore = async (): Promise<IngestStore> => {
  const vectorStore = Bun.env.VECTOR_STORE ?? "qdrant";

  if (vectorStore === "pgvector") {
    if (!Bun.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when VECTOR_STORE=pgvector");
    }
    const db = postgres(Bun.env.DATABASE_URL);
    return {
      name: "pgvector",
      upsertMany: (chunks) => new PgVectorStore(db).upsertMany(chunks),
      close: () => db.end(),
    };
  }

  if (vectorStore !== "qdrant") {
    throw new Error(`Unsupported VECTOR_STORE: ${vectorStore}. Use qdrant or pgvector.`);
  }

  const store = new QdrantVectorStore({
    url: Bun.env.QDRANT_URL ?? "http://localhost:6333",
    collection: Bun.env.QDRANT_COLLECTION ?? "protocol_docs",
    dimension: embeddingDimension(),
    apiKey: Bun.env.QDRANT_API_KEY,
  });
  await store.ensureCollection();

  return {
    name: "qdrant",
    upsertMany: (chunks) => store.upsertMany(chunks),
    close: async () => {},
  };
};

const main = async () => {
  const [docsDir] = Bun.argv.slice(2);
  if (!docsDir) {
    console.error("Usage: bun run ingest <docs-dir>");
    process.exit(1);
  }

  const embeddingClient = new OpenAIEmbeddingClient();
  const store = await createStore();

  const documents = await loadDocuments(docsDir);
  const chunks = documents.flatMap((doc) => chunkMarkdownDocument(doc, { maxChars: 800, overlapChars: 120 }));
  const embeddings = await embeddingClient.embed(chunks.map((chunk) => chunk.text));
  const embeddedChunks = chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] }));

  await store.upsertMany(embeddedChunks);
  await store.close();

  console.log(
    JSON.stringify(
      {
        docsDir,
        documents: documents.length,
        chunks: embeddedChunks.length,
        store: store.name,
      },
      null,
      2,
    ),
  );
};

await main();
