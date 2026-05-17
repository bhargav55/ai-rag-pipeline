import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("project documentation", () => {
  it("keeps an architecture document for production RAG operations", () => {
    const architecture = readFileSync("architecture.md", "utf8");

    expect(architecture).toContain("# Architecture");
    expect(architecture).toContain("Offline ingest path");
    expect(architecture).toContain("Online ask path");
    expect(architecture).toContain("contentHash");
    expect(architecture).toContain("indexVersion");
    expect(architecture).toContain("stale chunk deletion");
  });

  it("documents Qdrant as the only vector store and Postgres as registry only", () => {
    const readme = readFileSync("README.md", "utf8");
    const architecture = readFileSync("architecture.md", "utf8");

    expect(`${readme}\n${architecture}`).toContain("Qdrant");
    expect(`${readme}\n${architecture}`).toContain("Postgres");
    expect(`${readme}\n${architecture}`).not.toMatch(/pgvector/i);
  });
});
