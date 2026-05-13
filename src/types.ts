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
};

export type ChunkOptions = {
  maxChars: number;
  overlapChars: number;
};

export type EmbeddedChunk = Chunk & {
  embedding: number[];
};

export type SearchResult = {
  chunk: EmbeddedChunk;
  score: number;
};

export type EmbeddingClient = {
  embed(input: string[]): Promise<number[][]>;
};
