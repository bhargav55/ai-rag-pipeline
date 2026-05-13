import { describe, expect, it } from "vitest";
import { chunkDocument } from "../src/chunker";
import type { Document } from "../src/types";

describe("chunkDocument", () => {
  it("splits documents into overlapping chunks with citation metadata", () => {
    const doc: Document = {
      sourcePath: "perps/funding.md",
      extension: ".md",
      sizeBytes: 64,
      domain: "perps",
      text: "Funding rates align perpetual futures with spot prices over time.",
    };

    expect(chunkDocument(doc, { maxChars: 30, overlapChars: 8 })).toEqual([
      {
        id: "perps/funding.md#chunk-0",
        sourcePath: "perps/funding.md",
        domain: "perps",
        index: 0,
        text: "Funding rates align perpetual",
      },
      {
        id: "perps/funding.md#chunk-1",
        sourcePath: "perps/funding.md",
        domain: "perps",
        index: 1,
        text: "rpetual futures with spot pric",
      },
      {
        id: "perps/funding.md#chunk-2",
        sourcePath: "perps/funding.md",
        domain: "perps",
        index: 2,
        text: "pot prices over time.",
      },
    ]);
  });
});
