import { z } from "zod";
import { loadDocuments } from "../loader";
import { chunkMarkdownDocument } from "../markdown-section-chunker";

const argsSchema = z.tuple([z.string()]).rest(z.string());

const main = async () => {
  const [docsDir] = argsSchema.parse(Bun.argv.slice(2));
  if (!docsDir) {
    console.error("Usage: bun run load <docs-dir>");
    process.exit(1);
  }

  const documents = await loadDocuments(docsDir);
  const chunks = documents.flatMap((doc) => chunkMarkdownDocument(doc, { maxChars: 800, overlapChars: 120 }));

  console.log(
    JSON.stringify(
      {
        docsDir,
        documents: documents.length,
        chunks: chunks.length,
        sources: documents.map((doc) => ({
          sourcePath: doc.sourcePath,
          domain: doc.domain,
          sizeBytes: doc.sizeBytes,
        })),
      },
      null,
      2,
    ),
  );
};

await main();
