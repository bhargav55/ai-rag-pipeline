import type { EmbeddedChunk, SearchResult, VectorSearchStore } from "../types";

type PgRow = {
  id: string;
  source_path: string;
  domain: string;
  chunk_index: number;
  text: string;
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
        `insert into rag_chunks (id, source_path, domain, chunk_index, text, embedding)
         values ($1, $2, $3, $4, $5, $6::vector)
         on conflict (id) do update set
           source_path = excluded.source_path,
           domain = excluded.domain,
           chunk_index = excluded.chunk_index,
           text = excluded.text,
           embedding = excluded.embedding,
           updated_at = now()`,
        [chunk.id, chunk.sourcePath, chunk.domain, chunk.index, chunk.text, toVector(chunk.embedding)],
      );
    }
  }

  async search(queryEmbedding: number[], topK: number): Promise<SearchResult[]> {
    const rows = await this.db.unsafe<PgRow[]>(
      `select id, source_path, domain, chunk_index, text, embedding::text, 1 - (embedding <=> $1::vector) as score
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
        embedding: fromVector(row.embedding),
      },
    }));
  }
}
