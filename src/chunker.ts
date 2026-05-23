import type { Chunk, ChunkOptions, Document } from "./types";

export const chunkDocument = (doc: Document, options: ChunkOptions): Chunk[] => {
  if (options.maxChars <= 0) throw new Error("maxChars must be greater than 0");
  if (options.overlapChars < 0) throw new Error("overlapChars must be non-negative");
  if (options.overlapChars >= options.maxChars) {
    throw new Error("overlapChars must be smaller than maxChars");
  }

  const chunks: Chunk[] = [];
  const step = options.maxChars - options.overlapChars;

  for (let start = 0, index = 0; start < doc.text.length; start += step, index += 1) {
    const text = doc.text.slice(start, start + options.maxChars).trim();
    if (!text) continue;

    chunks.push({
      id: `${doc.sourcePath}#chunk-${index}`,
      sourcePath: doc.sourcePath,
      domain: doc.domain,
      index,
      text,
      ...(doc.tenantId ? { tenantId: doc.tenantId } : {}),
      ...(doc.siteId ? { siteId: doc.siteId } : {}),
    });
  }

  return chunks;
};
