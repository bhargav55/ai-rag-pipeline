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

  it("links the architecture document from the README", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("architecture.md");
  });
});
