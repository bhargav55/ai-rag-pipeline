import { describe, expect, it } from "vitest";
import { PgVectorStore } from "../src/stores/pg-vector-store";
import type { EmbeddedChunk } from "../src/types";

class FakeDb {
  calls: Array<{ sql: string; params: unknown[] }> = [];
  rows: unknown[] = [];

  async unsafe<T extends unknown[]>(sql: string, params: unknown[] = []): Promise<T> {
    this.calls.push({ sql, params });
    return this.rows as T;
  }
}

const embeddedChunk: EmbeddedChunk = {
  id: "perps/funding.md#chunk-0",
  sourcePath: "perps/funding.md",
  domain: "perps",
  index: 0,
  text: "Funding keeps perp prices aligned with spot.",
  headingPath: ["Funding"],
  contentHash: "doc-hash",
  chunkHash: "chunk-hash",
  embeddingModel: "text-embedding-3-small",
  embeddingDimension: 1536,
  indexVersion: "test-index-v1",
  indexedAt: "2026-05-16T00:00:00.000Z",
  embedding: [0.1, 0.2, 0.3],
};

describe("PgVectorStore", () => {
  it("upserts embedded chunks with metadata and pgvector string", async () => {
    const db = new FakeDb();
    const store = new PgVectorStore(db);

    await store.upsertMany([embeddedChunk]);

    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].sql).toContain("insert into rag_chunks");
    expect(db.calls[0].sql).toContain("on conflict (id) do update");
    expect(db.calls[0].params).toEqual([
      embeddedChunk.id,
      embeddedChunk.sourcePath,
      embeddedChunk.domain,
      embeddedChunk.index,
      embeddedChunk.text,
      JSON.stringify(["Funding"]),
      "doc-hash",
      "chunk-hash",
      "text-embedding-3-small",
      1536,
      "test-index-v1",
      "2026-05-16T00:00:00.000Z",
      "[0.1,0.2,0.3]",
    ]);
  });

  it("deletes stale chunks by id", async () => {
    const db = new FakeDb();
    const store = new PgVectorStore(db);

    await store.deleteMany(["old-a", "old-b"]);

    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].sql).toContain("delete from rag_chunks");
    expect(db.calls[0].sql).toContain("where id = any($1)");
    expect(db.calls[0].params).toEqual([["old-a", "old-b"]]);
  });

  it("searches pgvector with cosine distance and returns scored chunks", async () => {
    const db = new FakeDb();
    db.rows = [
      {
        id: "risk/liquidation.md#chunk-0",
        source_path: "risk/liquidation.md",
        domain: "risk",
        chunk_index: 0,
        text: "Liquidation happens below maintenance margin.",
        heading_path: ["Liquidation"],
        content_hash: "doc-hash",
        chunk_hash: "chunk-hash",
        embedding_model: "text-embedding-3-small",
        embedding_dimension: 1536,
        index_version: "test-index-v1",
        indexed_at: "2026-05-16T00:00:00.000Z",
        embedding: "[0.2,0.8]",
        score: 0.91,
      },
    ];
    const store = new PgVectorStore(db);

    const results = await store.search([0.2, 0.8], 1);

    expect(db.calls[0].sql).toContain("order by embedding <=> $1::vector");
    expect(db.calls[0].params).toEqual(["[0.2,0.8]", 1]);
    expect(results).toEqual([
      {
        score: 0.91,
        chunk: {
          id: "risk/liquidation.md#chunk-0",
          sourcePath: "risk/liquidation.md",
          domain: "risk",
          index: 0,
          text: "Liquidation happens below maintenance margin.",
          headingPath: ["Liquidation"],
          contentHash: "doc-hash",
          chunkHash: "chunk-hash",
          embeddingModel: "text-embedding-3-small",
          embeddingDimension: 1536,
          indexVersion: "test-index-v1",
          indexedAt: "2026-05-16T00:00:00.000Z",
          embedding: [0.2, 0.8],
        },
      },
    ]);
  });
});
