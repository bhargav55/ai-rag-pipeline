import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { IndexedChunk } from "./types";

type PgClient = {
  unsafe<T extends unknown[]>(sql: string, params?: unknown[]): Promise<T>;
};

type PgDocumentRegistryRow = {
  source_path: string;
  content_hash: string;
  chunk_ids: string[] | string;
  embedding_model: string;
  embedding_dimension: number;
  index_version: string;
  indexed_at: string | Date;
};

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

export type DocumentRegistry = {
  read(): Promise<DocumentRegistryState>;
  write(state: DocumentRegistryState): Promise<void>;
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

export class FileDocumentRegistry implements DocumentRegistry {
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

const parseChunkIds = (value: string[] | string): string[] => {
  if (Array.isArray(value)) return value.map(String);
  return JSON.parse(value) as string[];
};

export class PostgresDocumentRegistry implements DocumentRegistry {
  constructor(private readonly db: PgClient) {}

  async read(): Promise<DocumentRegistryState> {
    const rows = await this.db.unsafe<PgDocumentRegistryRow[]>(
      `select
         source_path,
         content_hash,
         chunk_ids,
         embedding_model,
         embedding_dimension,
         index_version,
         indexed_at
       from rag_documents
       order by source_path`,
    );

    return {
      documents: Object.fromEntries(
        rows.map((row) => [
          row.source_path,
          {
            sourcePath: row.source_path,
            contentHash: row.content_hash,
            chunkIds: parseChunkIds(row.chunk_ids),
            embeddingModel: row.embedding_model,
            embeddingDimension: Number(row.embedding_dimension),
            indexVersion: row.index_version,
            indexedAt: new Date(row.indexed_at).toISOString(),
          },
        ]),
      ),
    };
  }

  async write(state: DocumentRegistryState): Promise<void> {
    for (const record of Object.values(state.documents)) {
      await this.db.unsafe(
        `insert into rag_documents (
           source_path,
           content_hash,
           chunk_ids,
           embedding_model,
           embedding_dimension,
           index_version,
           indexed_at
         )
         values ($1, $2, $3::jsonb, $4, $5, $6, $7::timestamptz)
         on conflict (source_path) do update set
           content_hash = excluded.content_hash,
           chunk_ids = excluded.chunk_ids,
           embedding_model = excluded.embedding_model,
           embedding_dimension = excluded.embedding_dimension,
           index_version = excluded.index_version,
           indexed_at = excluded.indexed_at,
           updated_at = now()`,
        [
          record.sourcePath,
          record.contentHash,
          JSON.stringify(record.chunkIds),
          record.embeddingModel,
          record.embeddingDimension,
          record.indexVersion,
          record.indexedAt,
        ],
      );
    }
  }
}
