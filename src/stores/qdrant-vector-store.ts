import { createHash } from "node:crypto";
import type { EmbeddedChunk, SearchResult, VectorSearchStore } from "../types";

type QdrantFetch = (url: string, init?: RequestInit) => Promise<Response>;

type QdrantVectorStoreOptions = {
  url: string;
  collection: string;
  dimension: number;
  apiKey?: string;
  fetch?: QdrantFetch;
};

type QdrantPayload = {
  chunkId: string;
  sourcePath: string;
  domain: string;
  chunkIndex: number;
  text: string;
};

type QdrantSearchPoint = {
  id: string | number;
  score: number;
  vector?: number[] | Record<string, number[]>;
  payload?: Partial<QdrantPayload>;
};

type QdrantSearchResponse = {
  result?: QdrantSearchPoint[];
  status?: string;
  time?: number;
};

const qdrantPointId = (chunkId: string): string => {
  const hash = createHash("sha256").update(chunkId).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
};

const normalizeUrl = (url: string): string => url.replace(/\/$/, "");

const vectorFromResult = (vector: QdrantSearchPoint["vector"]): number[] => {
  if (Array.isArray(vector)) return vector;
  if (vector && Array.isArray(vector.default)) return vector.default;
  return [];
};

export class QdrantVectorStore implements VectorSearchStore {
  private readonly baseUrl: string;
  private readonly collection: string;
  private readonly dimension: number;
  private readonly fetchFn: QdrantFetch;
  private readonly apiKey?: string;

  constructor(options: QdrantVectorStoreOptions) {
    this.baseUrl = normalizeUrl(options.url);
    this.collection = options.collection;
    this.dimension = options.dimension;
    this.fetchFn = options.fetch ?? fetch;
    this.apiKey = options.apiKey;
  }

  async ensureCollection(): Promise<void> {
    await this.request(`/collections/${this.collection}`, {
      method: "PUT",
      body: JSON.stringify({
        vectors: {
          size: this.dimension,
          distance: "Cosine",
        },
      }),
    });
  }

  async upsertMany(chunks: EmbeddedChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    await this.request(`/collections/${this.collection}/points?wait=true`, {
      method: "PUT",
      body: JSON.stringify({
        points: chunks.map((chunk) => ({
          id: qdrantPointId(chunk.id),
          vector: chunk.embedding,
          payload: {
            chunkId: chunk.id,
            sourcePath: chunk.sourcePath,
            domain: chunk.domain,
            chunkIndex: chunk.index,
            text: chunk.text,
          } satisfies QdrantPayload,
        })),
      }),
    });
  }

  async search(queryEmbedding: number[], topK: number): Promise<SearchResult[]> {
    const response = await this.request<QdrantSearchResponse>(`/collections/${this.collection}/points/search`, {
      method: "POST",
      body: JSON.stringify({
        vector: queryEmbedding,
        limit: topK,
        with_payload: true,
        with_vector: true,
      }),
    });

    return (response.result ?? []).map((point) => {
      const payload = point.payload ?? {};
      return {
        score: Number(point.score),
        chunk: {
          id: String(payload.chunkId ?? point.id),
          sourcePath: String(payload.sourcePath ?? "unknown"),
          domain: String(payload.domain ?? "unknown"),
          index: Number(payload.chunkIndex ?? 0),
          text: String(payload.text ?? ""),
          embedding: vectorFromResult(point.vector),
        },
      };
    });
  }

  private async request<T = unknown>(path: string, init: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (this.apiKey) headers["api-key"] = this.apiKey;

    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : undefined;

    if (!response.ok) {
      throw new Error(`Qdrant API error ${response.status}: ${text}`);
    }

    return body as T;
  }
}
