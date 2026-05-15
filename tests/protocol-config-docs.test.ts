import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { loadDocuments } from "../src/loader";
import { chunkMarkdownDocument } from "../src/markdown-section-chunker";

const docsDir = join(import.meta.dir, "..", "data", "docs");

describe("protocol configuration docs", () => {
  it("documents protocol-specific risk and fee parameters for grounded RAG answers", async () => {
    const docs = await loadDocuments(docsDir);
    const configDoc = docs.find((doc) => doc.sourcePath === "protocol/configuration.md");

    expect(configDoc).toBeDefined();
    expect(configDoc?.text).toContain("maintenance margin ratio");
    expect(configDoc?.text).toContain("maker fee");
    expect(configDoc?.text).toContain("taker fee");
    expect(configDoc?.text).toContain("liquidator fee");
    expect(configDoc?.text).toContain("maximum leverage");
    expect(configDoc?.text).toContain("minimum leverage");
  });

  it("keeps protocol configuration parameters in retrievable section-aware chunks", async () => {
    const docs = await loadDocuments(docsDir);
    const configDoc = docs.find((doc) => doc.sourcePath === "protocol/configuration.md");
    expect(configDoc).toBeDefined();

    const chunks = chunkMarkdownDocument(configDoc!, { maxChars: 800, overlapChars: 120 });

    expect(chunks.some((chunk) => chunk.headingPath?.includes("Risk parameters"))).toBe(true);
    expect(chunks.some((chunk) => chunk.headingPath?.includes("Fee parameters"))).toBe(true);
    expect(chunks.some((chunk) => chunk.text.includes("maintenance margin ratio = 6%"))).toBe(true);
    expect(chunks.some((chunk) => chunk.text.includes("maker fee = 0.01%"))).toBe(true);
    expect(chunks.some((chunk) => chunk.text.includes("taker fee = 0.05%"))).toBe(true);
    expect(chunks.some((chunk) => chunk.text.includes("liquidator fee = 1.00%"))).toBe(true);
    expect(chunks.some((chunk) => chunk.text.includes("maximum leverage = 10x"))).toBe(true);
    expect(chunks.some((chunk) => chunk.text.includes("minimum leverage = 1x"))).toBe(true);
  });
});
