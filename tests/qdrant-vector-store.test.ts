import { describe, expect, it } from "vitest";
import { QdrantVectorStore } from "../src/stores/qdrant-vector-store";
import type { EmbeddedChunk } from "../src/types";

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

type FetchCall = {
  url: string;
  init?: RequestInit;
};

class FakeFetch {
  calls: FetchCall[] = [];
  responses: unknown[] = [];

  fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    this.calls.push({ url: String(url), init });
    const body = this.responses.shift() ?? { result: true };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

describe("QdrantVectorStore", () => {
  it("creates a cosine vector collection with the configured embedding dimension", async () => {
    const fake = new FakeFetch();
    const store = new QdrantVectorStore({
      url: "http://localhost:6333",
      collection: "protocol_docs",
      dimension: 1536,
      fetch: fake.fetch,
    });

    await store.ensureCollection();

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].url).toBe("http://localhost:6333/collections/protocol_docs");
    expect(fake.calls[0].init?.method).toBe("PUT");
    expect(JSON.parse(String(fake.calls[0].init?.body))).toEqual({
      vectors: {
        size: 1536,
        distance: "Cosine",
      },
    });
  });

  it("treats an already-existing collection as successful", async () => {
    const fake = new FakeFetch();
    fake.fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      fake.calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ status: { error: "Wrong input: Collection `protocol_docs` already exists!" } }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    };
    const store = new QdrantVectorStore({
      url: "http://localhost:6333",
      collection: "protocol_docs",
      dimension: 1536,
      fetch: fake.fetch,
    });

    await expect(store.ensureCollection()).resolves.toBeUndefined();
  });

  it("upserts embedded chunks as Qdrant points with chunk metadata payload", async () => {
    const fake = new FakeFetch();
    const store = new QdrantVectorStore({
      url: "http://localhost:6333",
      collection: "protocol_docs",
      dimension: 3,
      fetch: fake.fetch,
    });

    await store.upsertMany([embeddedChunk]);

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].url).toBe("http://localhost:6333/collections/protocol_docs/points?wait=true");
    expect(fake.calls[0].init?.method).toBe("PUT");

    const body = JSON.parse(String(fake.calls[0].init?.body));
    expect(body.points).toHaveLength(1);
    expect(body.points[0].vector).toEqual([0.1, 0.2, 0.3]);
    expect(body.points[0].payload).toEqual({
      chunkId: embeddedChunk.id,
      sourcePath: embeddedChunk.sourcePath,
      domain: embeddedChunk.domain,
      chunkIndex: embeddedChunk.index,
      text: embeddedChunk.text,
      headingPath: ["Funding"],
      contentHash: "doc-hash",
      chunkHash: "chunk-hash",
      embeddingModel: "text-embedding-3-small",
      embeddingDimension: 1536,
      indexVersion: "test-index-v1",
      indexedAt: "2026-05-16T00:00:00.000Z",
    });
    expect(body.points[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("deletes stale chunks by stable point IDs", async () => {
    const fake = new FakeFetch();
    const store = new QdrantVectorStore({
      url: "http://localhost:6333",
      collection: "protocol_docs",
      dimension: 3,
      fetch: fake.fetch,
    });

    await store.deleteMany(["perps/funding.md#chunk-0", "perps/funding.md#chunk-1"]);

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].url).toBe("http://localhost:6333/collections/protocol_docs/points/delete?wait=true");
    expect(fake.calls[0].init?.method).toBe("POST");
    const body = JSON.parse(String(fake.calls[0].init?.body));
    expect(body.points).toHaveLength(2);
    expect(body.points[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.points[1]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("searches Qdrant and maps results back into scored chunks", async () => {
    const fake = new FakeFetch();
    fake.responses = [
      {
        result: [
          {
            id: "8b95e686-cb91-5140-9f3a-a06c87bf98e0",
            score: 0.92,
            vector: [0.2, 0.8],
            payload: {
              chunkId: "risk/liquidation.md#chunk-0",
              sourcePath: "risk/liquidation.md",
              domain: "risk",
              chunkIndex: 0,
              text: "Liquidation happens below maintenance margin.",
              headingPath: ["Liquidation"],
              contentHash: "doc-hash",
              chunkHash: "chunk-hash",
              embeddingModel: "text-embedding-3-small",
              embeddingDimension: 1536,
              indexVersion: "test-index-v1",
              indexedAt: "2026-05-16T00:00:00.000Z",
            },
          },
        ],
      },
    ];
    const store = new QdrantVectorStore({
      url: "http://localhost:6333",
      collection: "protocol_docs",
      dimension: 2,
      fetch: fake.fetch,
    });

    const results = await store.search([0.2, 0.8], 1);

    expect(fake.calls[0].url).toBe("http://localhost:6333/collections/protocol_docs/points/search");
    expect(fake.calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(fake.calls[0].init?.body))).toEqual({
      vector: [0.2, 0.8],
      limit: 1,
      with_payload: true,
      with_vector: true,
    });
    expect(results).toEqual([
      {
        score: 0.92,
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

  it("searches Qdrant with tenant and site filters", async () => {
    const fake = new FakeFetch();
    fake.responses = [{ result: [] }];
    const store = new QdrantVectorStore({
      url: "http://localhost:6333",
      collection: "rag_chunks",
      dimension: 2,
      fetch: fake.fetch,
    });

    await store.search([0.1, 0.9], 3, { tenantId: "personal", siteId: "bhargav-portfolio" });

    expect(JSON.parse(String(fake.calls[0].init?.body))).toEqual({
      vector: [0.1, 0.9],
      limit: 3,
      with_payload: true,
      with_vector: true,
      filter: {
        must: [
          { key: "tenantId", match: { value: "personal" } },
          { key: "siteId", match: { value: "bhargav-portfolio" } },
        ],
      },
    });
  });
});
