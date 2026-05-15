import { OpenAIEmbeddingClient } from "../embeddings/openai";
import { loadDocuments } from "../loader";
import { chunkMarkdownDocument } from "../markdown-section-chunker";
import { buildRetrievalIndex, retrieve } from "../retriever";

const main = async () => {
  const [docsDir, query, topKArg] = Bun.argv.slice(2);
  if (!docsDir || !query) {
    console.error("Usage: bun run retrieve <docs-dir> <query> [topK]");
    process.exit(1);
  }

  const topK = topKArg ? Number(topKArg) : 3;
  const documents = await loadDocuments(docsDir);
  const chunks = documents.flatMap((doc) => chunkMarkdownDocument(doc, { maxChars: 800, overlapChars: 120 }));
  const embeddingClient = new OpenAIEmbeddingClient();
  const index = await buildRetrievalIndex(chunks, embeddingClient);
  const results = await retrieve(index, embeddingClient, query, topK);

  console.log(
    JSON.stringify(
      {
        query,
        topK,
        results: results.map(({ chunk, score }) => ({
          score,
          sourcePath: chunk.sourcePath,
          domain: chunk.domain,
          chunkId: chunk.id,
          text: chunk.text,
        })),
      },
      null,
      2,
    ),
  );
};

await main();
