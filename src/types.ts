export type SupportedExtension = ".md" | ".txt";

export type Document = {
  sourcePath: string;
  extension: SupportedExtension;
  sizeBytes: number;
  domain: string;
  text: string;
};

export type Chunk = {
  id: string;
  sourcePath: string;
  domain: string;
  index: number;
  text: string;
  headingPath?: string[];
};

export type ChunkOptions = {
  maxChars: number;
  overlapChars: number;
};

export type IndexMetadata = {
  contentHash?: string;
  chunkHash?: string;
  embeddingModel?: string;
  embeddingDimension?: number;
  indexVersion?: string;
  indexedAt?: string;
};

export type IndexedChunk = Chunk & Required<IndexMetadata>;

export type EmbeddedChunk = Chunk & IndexMetadata & {
  embedding: number[];
};

export type SearchResult = {
  chunk: EmbeddedChunk;
  score: number;
};

export type EmbeddingClient = {
  embed(input: string[]): Promise<number[][]>;
};

export type VectorSearchStore = {
  search(queryEmbedding: number[], topK: number): Promise<SearchResult[]> | SearchResult[];
};

export type LlmPrompt = {
  system: string;
  user: string;
};

export type LlmClient = {
  answer(prompt: LlmPrompt): Promise<string>;
};

export type RagRetrievedChunkTrace = {
  chunkId: string;
  sourcePath: string;
  headingPath?: string[];
  score: number;
  contentHash?: string;
  chunkHash?: string;
  embeddingModel?: string;
  embeddingDimension?: number;
  indexVersion?: string;
  indexedAt?: string;
};

export type RagTraceTimings = {
  embedding: number;
  vectorSearch: number;
  promptBuild: number;
  llm: number;
  validation: number;
  total: number;
};

export type RagTraceEvent = {
  event: "rag.answer.completed" | "rag.answer.failed";
  requestId: string;
  question: string;
  topK: number;
  model?: string;
  retrievedChunks: RagRetrievedChunkTrace[];
  timingsMs: RagTraceTimings;
  error?: {
    name: string;
    message: string;
  };
};

export type RagTracer = {
  requestId?: string;
  model?: string;
  nowMs?: () => number;
  log(event: RagTraceEvent): void;
};
