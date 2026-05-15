import postgres from "postgres";
import { OpenAIEmbeddingClient } from "../embeddings/openai";
import { loadDocuments } from "../loader";
import { addIndexMetadata, defaultIndexVersion } from "../index-metadata";
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
const embeddingModel = () => Bun.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
const indexVersion = () => Bun.env.INDEX_VERSION ?? defaultIndexVersion();

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
  const currentEmbeddingModel = embeddingModel();
  const currentEmbeddingDimension = embeddingDimension();
  const currentIndexVersion = indexVersion();
  const indexedAt = new Date().toISOString();
  const indexedChunks = addIndexMetadata({
    documents,
    chunks,
    embeddingModel: currentEmbeddingModel,
    embeddingDimension: currentEmbeddingDimension,
    indexVersion: currentIndexVersion,
    indexedAt,
  });
  const embeddings = await embeddingClient.embed(indexedChunks.map((chunk) => chunk.text));
  const embeddedChunks = indexedChunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] }));

  await store.upsertMany(embeddedChunks);
  await store.close();

  console.log(
    JSON.stringify(
      {
        docsDir,
        documents: documents.length,
        chunks: embeddedChunks.length,
        store: store.name,
        embeddingModel: currentEmbeddingModel,
        embeddingDimension: currentEmbeddingDimension,
        indexVersion: currentIndexVersion,
        indexedAt,
      },
      null,
      2,
    ),
  );
};

await main();
