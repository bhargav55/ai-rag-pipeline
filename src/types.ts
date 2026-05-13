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
