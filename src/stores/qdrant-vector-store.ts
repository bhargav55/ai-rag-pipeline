import { createHash } from "node:crypto";
import type { EmbeddedChunk, SearchFilter, SearchResult, VectorSearchStore } from "../types";

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
  headingPath?: string[];
  tenantId?: string;
  siteId?: string;
  contentHash?: string;
  chunkHash?: string;
  embeddingModel?: string;
  embeddingDimension?: number;
  indexVersion?: string;
  indexedAt?: string;
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

const qdrantFilter = ({ tenantId, siteId }: SearchFilter) => {
  const must = [
    tenantId ? { key: "tenantId", match: { value: tenantId } } : undefined,
    siteId ? { key: "siteId", match: { value: siteId } } : undefined,
  ].filter(Boolean);

  return must.length > 0 ? { must } : undefined;
};

type QdrantRequestInit = RequestInit & {
  okStatuses?: number[];
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
      okStatuses: [200, 409],
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
            headingPath: chunk.headingPath,
            tenantId: chunk.tenantId,
            siteId: chunk.siteId,
            contentHash: chunk.contentHash,
            chunkHash: chunk.chunkHash,
            embeddingModel: chunk.embeddingModel,
            embeddingDimension: chunk.embeddingDimension,
            indexVersion: chunk.indexVersion,
            indexedAt: chunk.indexedAt,
          } satisfies QdrantPayload,
        })),
      }),
    });
  }

  async deleteMany(chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0) return;

    await this.request(`/collections/${this.collection}/points/delete?wait=true`, {
      method: "POST",
      body: JSON.stringify({
        points: chunkIds.map(qdrantPointId),
      }),
    });
  }

  async search(queryEmbedding: number[], topK: number, filter: SearchFilter = {}): Promise<SearchResult[]> {
    const qdrantSearchFilter = qdrantFilter(filter);
    const response = await this.request<QdrantSearchResponse>(`/collections/${this.collection}/points/search`, {
      method: "POST",
      body: JSON.stringify({
        vector: queryEmbedding,
        limit: topK,
        with_payload: true,
        with_vector: true,
        ...(qdrantSearchFilter ? { filter: qdrantSearchFilter } : {}),
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
          headingPath: Array.isArray(payload.headingPath) ? payload.headingPath.map(String) : undefined,
          tenantId: typeof payload.tenantId === "string" ? payload.tenantId : undefined,
          siteId: typeof payload.siteId === "string" ? payload.siteId : undefined,
          contentHash: typeof payload.contentHash === "string" ? payload.contentHash : undefined,
          chunkHash: typeof payload.chunkHash === "string" ? payload.chunkHash : undefined,
          embeddingModel: typeof payload.embeddingModel === "string" ? payload.embeddingModel : undefined,
          embeddingDimension: typeof payload.embeddingDimension === "number" ? payload.embeddingDimension : undefined,
          indexVersion: typeof payload.indexVersion === "string" ? payload.indexVersion : undefined,
          indexedAt: typeof payload.indexedAt === "string" ? payload.indexedAt : undefined,
          embedding: vectorFromResult(point.vector),
        },
      };
    });
  }

  private async request<T = unknown>(path: string, init: QdrantRequestInit): Promise<T> {
    const { okStatuses, ...requestInit } = init;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(requestInit.headers as Record<string, string> | undefined),
    };
    if (this.apiKey) headers["api-key"] = this.apiKey;

    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...requestInit,
      headers,
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : undefined;

    const allowedStatuses = okStatuses ?? [];
    if (!response.ok && !allowedStatuses.includes(response.status)) {
      throw new Error(`Qdrant API error ${response.status}: ${text}`);
    }

    return body as T;
  }
}
