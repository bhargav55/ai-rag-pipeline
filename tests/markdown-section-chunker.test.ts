import { describe, expect, it } from "vitest";
import { chunkMarkdownDocument } from "../src/markdown-section-chunker";
import type { Document } from "../src/types";

const markdownDoc = (text: string): Document => ({
  sourcePath: "perps/funding.md",
  extension: ".md",
  sizeBytes: Buffer.byteLength(text),
  domain: "perps",
  text,
});

describe("chunkMarkdownDocument", () => {
  it("preserves markdown headings in chunk metadata and text", () => {
    const doc = markdownDoc(`# Funding Rates

Funding keeps perpetual futures aligned with spot.

## Premium Index

The premium index measures perp price divergence from spot.`);

    expect(chunkMarkdownDocument(doc, { maxChars: 160, overlapChars: 20 })).toEqual([
      {
        id: "perps/funding.md#section-funding-rates-chunk-0",
        sourcePath: "perps/funding.md",
        domain: "perps",
        index: 0,
        headingPath: ["Funding Rates"],
        text: "# Funding Rates\n\nFunding keeps perpetual futures aligned with spot.",
      },
      {
        id: "perps/funding.md#section-funding-rates-premium-index-chunk-1",
        sourcePath: "perps/funding.md",
        domain: "perps",
        index: 1,
        headingPath: ["Funding Rates", "Premium Index"],
        text: "# Funding Rates > Premium Index\n\n## Premium Index\n\nThe premium index measures perp price divergence from spot.",
      },
    ]);
  });

  it("falls back to fixed chunking for plain text documents", () => {
    const doc: Document = {
      sourcePath: "risk/oracle.txt",
      extension: ".txt",
      sizeBytes: 64,
      domain: "risk",
      text: "Oracle price manipulation can affect margin and liquidation checks.",
    };

    expect(chunkMarkdownDocument(doc, { maxChars: 30, overlapChars: 8 })).toEqual([
      {
        id: "risk/oracle.txt#chunk-0",
        sourcePath: "risk/oracle.txt",
        domain: "risk",
        index: 0,
        text: "Oracle price manipulation can",
      },
      {
        id: "risk/oracle.txt#chunk-1",
        sourcePath: "risk/oracle.txt",
        domain: "risk",
        index: 1,
        text: "ion can affect margin and liqu",
      },
      {
        id: "risk/oracle.txt#chunk-2",
        sourcePath: "risk/oracle.txt",
        domain: "risk",
        index: 2,
        text: "and liquidation checks.",
      },
      {
        id: "risk/oracle.txt#chunk-3",
        sourcePath: "risk/oracle.txt",
        domain: "risk",
        index: 3,
        text: ".",
      },
    ]);
  });
});
