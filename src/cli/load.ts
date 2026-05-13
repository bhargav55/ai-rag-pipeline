import { z } from "zod";
import { chunkDocument } from "../chunker";
import { loadDocuments } from "../loader";

const argsSchema = z.tuple([z.string()]).rest(z.string());

const main = async () => {
  const [docsDir] = argsSchema.parse(Bun.argv.slice(2));
  if (!docsDir) {
    console.error("Usage: bun run load <docs-dir>");
    process.exit(1);
  }

  const documents = await loadDocuments(docsDir);
  const chunks = documents.flatMap((doc) => chunkDocument(doc, { maxChars: 800, overlapChars: 120 }));

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
