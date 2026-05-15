import type { EmbeddedChunk, SearchResult, VectorSearchStore } from "../types";

type PgRow = {
  id: string;
  source_path: string;
  domain: string;
  chunk_index: number;
  text: string;
  heading_path?: string[] | null;
  content_hash?: string | null;
  chunk_hash?: string | null;
  embedding_model?: string | null;
  embedding_dimension?: number | null;
  index_version?: string | null;
  indexed_at?: string | Date | null;
  embedding: string | number[];
  score: number;
};

type PgClient = {
  unsafe<T extends unknown[]>(sql: string, params?: unknown[]): Promise<T>;
};

const toVector = (embedding: number[]) => `[${embedding.join(",")}]`;

const fromVector = (embedding: string | number[]): number[] => {
  if (Array.isArray(embedding)) return embedding;
  return embedding
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .filter(Boolean)
    .map(Number);
};

export class PgVectorStore implements VectorSearchStore {
  constructor(private readonly db: PgClient) {}

  async upsertMany(chunks: EmbeddedChunk[]): Promise<void> {
    for (const chunk of chunks) {
      await this.db.unsafe(
        `insert into rag_chunks (
           id,
           source_path,
           domain,
           chunk_index,
           text,
           heading_path,
           content_hash,
           chunk_hash,
           embedding_model,
           embedding_dimension,
           index_version,
           indexed_at,
           embedding
         )
         values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12::timestamptz, $13::vector)
         on conflict (id) do update set
           source_path = excluded.source_path,
           domain = excluded.domain,
           chunk_index = excluded.chunk_index,
           text = excluded.text,
           heading_path = excluded.heading_path,
           content_hash = excluded.content_hash,
           chunk_hash = excluded.chunk_hash,
           embedding_model = excluded.embedding_model,
           embedding_dimension = excluded.embedding_dimension,
           index_version = excluded.index_version,
           indexed_at = excluded.indexed_at,
           embedding = excluded.embedding,
           updated_at = now()`,
        [
          chunk.id,
          chunk.sourcePath,
          chunk.domain,
          chunk.index,
          chunk.text,
          JSON.stringify(chunk.headingPath ?? []),
          chunk.contentHash ?? null,
          chunk.chunkHash ?? null,
          chunk.embeddingModel ?? null,
          chunk.embeddingDimension ?? null,
          chunk.indexVersion ?? null,
          chunk.indexedAt ?? null,
          toVector(chunk.embedding),
        ],
      );
    }
  }

  async search(queryEmbedding: number[], topK: number): Promise<SearchResult[]> {
    const rows = await this.db.unsafe<PgRow[]>(
      `select
         id,
         source_path,
         domain,
         chunk_index,
         text,
         heading_path,
         content_hash,
         chunk_hash,
         embedding_model,
         embedding_dimension,
         index_version,
         indexed_at,
         embedding::text,
         1 - (embedding <=> $1::vector) as score
       from rag_chunks
       order by embedding <=> $1::vector
       limit $2`,
      [toVector(queryEmbedding), topK],
    );

    return rows.map((row) => ({
      score: Number(row.score),
      chunk: {
        id: row.id,
        sourcePath: row.source_path,
        domain: row.domain,
        index: row.chunk_index,
        text: row.text,
        headingPath: row.heading_path ?? undefined,
        contentHash: row.content_hash ?? undefined,
        chunkHash: row.chunk_hash ?? undefined,
        embeddingModel: row.embedding_model ?? undefined,
        embeddingDimension: row.embedding_dimension ?? undefined,
        indexVersion: row.index_version ?? undefined,
        indexedAt: row.indexed_at ? new Date(row.indexed_at).toISOString() : undefined,
        embedding: fromVector(row.embedding),
      },
    }));
  }
}
