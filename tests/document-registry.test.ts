import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileDocumentRegistry, planRegistryUpdate } from "../src/document-registry";
import type { IndexedChunk } from "../src/types";

const indexedAt = "2026-05-16T00:00:00.000Z";

const chunk = (sourcePath: string, id: string, contentHash = "hash-v1"): IndexedChunk => ({
  id,
  sourcePath,
  domain: sourcePath.split("/")[0] ?? "protocol",
  index: 0,
  text: `content for ${id}`,
  contentHash,
  chunkHash: `${id}-chunk-hash`,
  embeddingModel: "text-embedding-3-small",
  embeddingDimension: 1536,
  indexVersion: "index-v1",
  indexedAt,
});

describe("document registry", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it("plans unchanged document skips and stale chunk deletion", () => {
    const existing = {
      documents: {
        "protocol/configuration.md": {
          sourcePath: "protocol/configuration.md",
          contentHash: "hash-v1",
          chunkIds: ["old-a", "old-b", "old-c"],
          embeddingModel: "text-embedding-3-small",
          embeddingDimension: 1536,
          indexVersion: "old-index",
          indexedAt: "2026-05-15T00:00:00.000Z",
        },
        "risk/oracle.txt": {
          sourcePath: "risk/oracle.txt",
          contentHash: "oracle-hash-v1",
          chunkIds: ["oracle-old"],
          embeddingModel: "text-embedding-3-small",
          embeddingDimension: 1536,
          indexVersion: "old-index",
          indexedAt: "2026-05-15T00:00:00.000Z",
        },
      },
    };

    const plan = planRegistryUpdate(existing, [
      chunk("protocol/configuration.md", "old-a", "hash-v2"),
      chunk("protocol/configuration.md", "new-b", "hash-v2"),
      chunk("risk/oracle.txt", "oracle-new", "oracle-hash-v1"),
    ]);

    expect(plan.chunksToUpsert.map((item) => item.id)).toEqual(["old-a", "new-b"]);
    expect(plan.staleChunkIds).toEqual(["old-b", "old-c"]);
    expect(plan.skippedSourcePaths).toEqual(["risk/oracle.txt"]);
    expect(plan.next.documents["protocol/configuration.md"].chunkIds).toEqual(["old-a", "new-b"]);
    expect(plan.next.documents["protocol/configuration.md"].contentHash).toBe("hash-v2");
    expect(plan.next.documents["risk/oracle.txt"]).toBe(existing.documents["risk/oracle.txt"]);
  });

  it("persists registry JSON to disk", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "rag-registry-"));
    const registryPath = join(tempDir, "registry.json");
    const registry = new FileDocumentRegistry(registryPath);
    const state = {
      documents: {
        "protocol/configuration.md": {
          sourcePath: "protocol/configuration.md",
          contentHash: "hash-v1",
          chunkIds: ["chunk-a"],
          embeddingModel: "text-embedding-3-small",
          embeddingDimension: 1536,
          indexVersion: "index-v1",
          indexedAt,
        },
      },
    };

    await registry.write(state);

    await expect(registry.read()).resolves.toEqual(state);
  });
});
