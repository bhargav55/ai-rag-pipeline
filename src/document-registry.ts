import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { IndexedChunk } from "./types";

export type DocumentRegistryRecord = {
  sourcePath: string;
  contentHash: string;
  chunkIds: string[];
  embeddingModel: string;
  embeddingDimension: number;
  indexVersion: string;
  indexedAt: string;
};

export type DocumentRegistryState = {
  documents: Record<string, DocumentRegistryRecord>;
};

export type RegistryUpdatePlan = {
  chunksToUpsert: IndexedChunk[];
  staleChunkIds: string[];
  skippedSourcePaths: string[];
  next: DocumentRegistryState;
};

export const emptyRegistryState = (): DocumentRegistryState => ({ documents: {} });

const groupChunksBySource = (chunks: IndexedChunk[]): Map<string, IndexedChunk[]> => {
  const grouped = new Map<string, IndexedChunk[]>();
  for (const chunk of chunks) {
    const current = grouped.get(chunk.sourcePath) ?? [];
    current.push(chunk);
    grouped.set(chunk.sourcePath, current);
  }
  return grouped;
};

export const planRegistryUpdate = (
  existing: DocumentRegistryState,
  indexedChunks: IndexedChunk[],
): RegistryUpdatePlan => {
  const chunksToUpsert: IndexedChunk[] = [];
  const staleChunkIds: string[] = [];
  const skippedSourcePaths: string[] = [];
  const next: DocumentRegistryState = { documents: { ...existing.documents } };

  for (const [sourcePath, chunks] of groupChunksBySource(indexedChunks)) {
    const first = chunks[0];
    const previous = existing.documents[sourcePath];
    const nextChunkIds = chunks.map((chunk) => chunk.id);

    if (
      previous &&
      previous.contentHash === first.contentHash &&
      previous.embeddingModel === first.embeddingModel &&
      previous.embeddingDimension === first.embeddingDimension
    ) {
      skippedSourcePaths.push(sourcePath);
      next.documents[sourcePath] = previous;
      continue;
    }

    chunksToUpsert.push(...chunks);
    const nextChunkIdSet = new Set(nextChunkIds);
    if (previous) {
      staleChunkIds.push(...previous.chunkIds.filter((chunkId) => !nextChunkIdSet.has(chunkId)));
    }

    next.documents[sourcePath] = {
      sourcePath,
      contentHash: first.contentHash,
      chunkIds: nextChunkIds,
      embeddingModel: first.embeddingModel,
      embeddingDimension: first.embeddingDimension,
      indexVersion: first.indexVersion,
      indexedAt: first.indexedAt,
    };
  }

  return {
    chunksToUpsert,
    staleChunkIds,
    skippedSourcePaths,
    next,
  };
};

export class FileDocumentRegistry {
  constructor(private readonly path: string) {}

  async read(): Promise<DocumentRegistryState> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as DocumentRegistryState;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return emptyRegistryState();
      }
      throw error;
    }
  }

  async write(state: DocumentRegistryState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(state, null, 2)}\n`);
  }
}
