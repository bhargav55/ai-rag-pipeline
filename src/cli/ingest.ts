import postgres from "postgres";
import {
  FileDocumentRegistry,
  PostgresDocumentRegistry,
  type DocumentRegistry,
  planRegistryUpdate,
} from "../document-registry";
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
  deleteMany(chunkIds: string[]): Promise<void>;
  close(): Promise<void>;
};

type IngestServices = {
  store: IngestStore;
  registry: DocumentRegistry;
  registryStore: "postgres" | "file";
  registryPath?: string;
};

const embeddingDimension = () => Number(Bun.env.EMBEDDING_DIMENSION ?? "1536");
const embeddingModel = () => Bun.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
const indexVersion = () => Bun.env.INDEX_VERSION ?? defaultIndexVersion();
const registryStore = () => Bun.env.DOCUMENT_REGISTRY_STORE ?? "postgres";
const registryPath = () => Bun.env.DOCUMENT_REGISTRY_PATH ?? ".rag/document-registry.json";

const createRegistry = (db?: postgres.Sql): Pick<IngestServices, "registry" | "registryStore" | "registryPath"> => {
  const store = registryStore();
  if (store === "postgres") {
    if (!db) {
      throw new Error("DATABASE_URL is required when DOCUMENT_REGISTRY_STORE=postgres");
    }
    return { registry: new PostgresDocumentRegistry(db), registryStore: "postgres" };
  }
  if (store === "file") {
    const path = registryPath();
    return { registry: new FileDocumentRegistry(path), registryStore: "file", registryPath: path };
  }
  throw new Error(`Unsupported DOCUMENT_REGISTRY_STORE: ${store}. Use postgres or file.`);
};

const createServices = async (): Promise<IngestServices> => {
  const vectorStore = Bun.env.VECTOR_STORE ?? "qdrant";
  const needsDatabase = vectorStore === "pgvector" || registryStore() === "postgres";
  const db = needsDatabase
    ? postgres(Bun.env.DATABASE_URL ?? (() => {
        throw new Error("DATABASE_URL is required when VECTOR_STORE=pgvector or DOCUMENT_REGISTRY_STORE=postgres");
      })())
    : undefined;
  const registry = createRegistry(db);

  if (vectorStore === "pgvector") {
    if (!db) {
      throw new Error("DATABASE_URL is required when VECTOR_STORE=pgvector");
    }
    const pgStore = new PgVectorStore(db);
    return {
      store: {
        name: "pgvector",
        upsertMany: (chunks) => pgStore.upsertMany(chunks),
        deleteMany: (chunkIds) => pgStore.deleteMany(chunkIds),
        close: () => db.end(),
      },
      ...registry,
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
    store: {
      name: "qdrant",
      upsertMany: (chunks) => store.upsertMany(chunks),
      deleteMany: (chunkIds) => store.deleteMany(chunkIds),
      close: () => db?.end() ?? Promise.resolve(),
    },
    ...registry,
  };
};

const main = async () => {
  const [docsDir] = Bun.argv.slice(2);
  if (!docsDir) {
    console.error("Usage: bun run ingest <docs-dir>");
    process.exit(1);
  }

  const embeddingClient = new OpenAIEmbeddingClient();
  const { store, registry, registryStore: activeRegistryStore, registryPath: activeRegistryPath } = await createServices();

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
  const registryState = await registry.read();
  const registryPlan = planRegistryUpdate(registryState, indexedChunks);
  const embeddings = await embeddingClient.embed(registryPlan.chunksToUpsert.map((chunk) => chunk.text));
  const embeddedChunks = registryPlan.chunksToUpsert.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] }));

  await store.deleteMany(registryPlan.staleChunkIds);
  await store.upsertMany(embeddedChunks);
  await registry.write(registryPlan.next);
  await store.close();

  console.log(
    JSON.stringify(
      {
        docsDir,
        documents: documents.length,
        chunks: chunks.length,
        upsertedChunks: embeddedChunks.length,
        deletedStaleChunks: registryPlan.staleChunkIds.length,
        skippedDocuments: registryPlan.skippedSourcePaths.length,
        registryStore: activeRegistryStore,
        ...(activeRegistryPath ? { registryPath: activeRegistryPath } : {}),
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
