import postgres from "postgres";
import { chunkDocument } from "../chunker";
import { OpenAIEmbeddingClient } from "../embeddings/openai";
import { loadDocuments } from "../loader";
import { PgVectorStore } from "../stores/pg-vector-store";

const main = async () => {
  const [docsDir] = Bun.argv.slice(2);
  if (!docsDir) {
    console.error("Usage: bun run ingest <docs-dir>");
    process.exit(1);
  }
  if (!Bun.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for pgvector ingestion");
  }

  const db = postgres(Bun.env.DATABASE_URL);
  const embeddingClient = new OpenAIEmbeddingClient();
  const store = new PgVectorStore(db);

  const documents = await loadDocuments(docsDir);
  const chunks = documents.flatMap((doc) => chunkDocument(doc, { maxChars: 800, overlapChars: 120 }));
  const embeddings = await embeddingClient.embed(chunks.map((chunk) => chunk.text));
  const embeddedChunks = chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] }));

  await store.upsertMany(embeddedChunks);
  await db.end();

  console.log(
    JSON.stringify(
      {
        docsDir,
        documents: documents.length,
        chunks: embeddedChunks.length,
        store: "pgvector",
      },
      null,
      2,
    ),
  );
};

await main();
