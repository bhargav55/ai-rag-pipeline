import { createHash } from "node:crypto";
import type { Chunk, Document, IndexedChunk } from "./types";

export type AddIndexMetadataInput = {
  documents: Document[];
  chunks: Chunk[];
  embeddingModel: string;
  embeddingDimension: number;
  indexVersion: string;
  indexedAt?: string;
};

export const sha256Hex = (input: string): string => createHash("sha256").update(input).digest("hex");

export const defaultIndexVersion = (now = new Date()): string =>
  `index-${now.toISOString().replace(/[:.]/g, "-")}`;

export const addIndexMetadata = ({
  documents,
  chunks,
  embeddingModel,
  embeddingDimension,
  indexVersion,
  indexedAt = new Date().toISOString(),
}: AddIndexMetadataInput): IndexedChunk[] => {
  const documentsBySource = new Map(documents.map((document) => [document.sourcePath, document]));

  return chunks.map((chunk) => {
    const document = documentsBySource.get(chunk.sourcePath);
    if (!document) {
      throw new Error(`Missing source document for chunk ${chunk.id} at ${chunk.sourcePath}`);
    }

    return {
      ...chunk,
      contentHash: sha256Hex(document.text),
      chunkHash: sha256Hex(chunk.text),
      embeddingModel,
      embeddingDimension,
      indexVersion,
      indexedAt,
    };
  });
};
