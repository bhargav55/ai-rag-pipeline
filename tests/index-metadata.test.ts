import { describe, expect, it } from "vitest";
import { addIndexMetadata, sha256Hex } from "../src/index-metadata";
import type { Chunk, Document } from "../src/types";

const document: Document = {
  sourcePath: "protocol/configuration.md",
  extension: ".md",
  sizeBytes: 128,
  domain: "protocol",
  text: "# Protocol Configuration\nmaintenance margin ratio = 6%",
};

const chunk: Chunk = {
  id: "protocol/configuration.md#protocol-configuration-0",
  sourcePath: "protocol/configuration.md",
  domain: "protocol",
  index: 0,
  text: "# Protocol Configuration\nmaintenance margin ratio = 6%",
  headingPath: ["Protocol Configuration"],
};

describe("index metadata", () => {
  it("computes stable SHA-256 hashes for document and chunk content", () => {
    expect(sha256Hex("maintenance margin ratio = 6%")).toBe(
      "fe0d0073e63b73a2f38c0ac110e92b1f56f2dffcc87d3e15fb364c000d4f4e62",
    );
  });

  it("attaches production index metadata to chunks before embedding/upsert", () => {
    const [annotated] = addIndexMetadata({
      documents: [document],
      chunks: [chunk],
      embeddingModel: "text-embedding-3-small",
      embeddingDimension: 1536,
      indexVersion: "test-index-v1",
      indexedAt: "2026-05-16T00:00:00.000Z",
    });

    expect(annotated).toMatchObject({
      ...chunk,
      contentHash: sha256Hex(document.text),
      chunkHash: sha256Hex(chunk.text),
      embeddingModel: "text-embedding-3-small",
      embeddingDimension: 1536,
      indexVersion: "test-index-v1",
      indexedAt: "2026-05-16T00:00:00.000Z",
    });
  });

  it("fails closed when a chunk does not map to a loaded source document", () => {
    expect(() =>
      addIndexMetadata({
        documents: [],
        chunks: [chunk],
        embeddingModel: "text-embedding-3-small",
        embeddingDimension: 1536,
        indexVersion: "test-index-v1",
        indexedAt: "2026-05-16T00:00:00.000Z",
      }),
    ).toThrow("Missing source document for chunk protocol/configuration.md#protocol-configuration-0");
  });
});
