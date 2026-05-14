import { describe, expect, it } from "vitest";
import { buildRagPrompt } from "../src/prompt";
import type { SearchResult } from "../src/types";

const result = (sourcePath: string, text: string, score = 0.9): SearchResult => ({
  score,
  chunk: {
    id: `${sourcePath}#chunk-0`,
    sourcePath,
    domain: sourcePath.split("/")[0],
    index: 0,
    text,
    embedding: [0.1, 0.2],
  },
});

describe("buildRagPrompt", () => {
  it("combines retrieved context with user question and citation rules", () => {
    const prompt = buildRagPrompt({
      question: "When does liquidation happen?",
      results: [
        result("risk/liquidation.md", "Liquidation happens below maintenance margin."),
        result("perps/margin.md", "Maintenance margin controls liquidation eligibility."),
      ],
    });

    expect(prompt.system).toContain("answer only from the provided context");
    expect(prompt.user).toContain("Question:\nWhen does liquidation happen?");
    expect(prompt.user).toContain("[1] Source: risk/liquidation.md");
    expect(prompt.user).toContain("[2] Source: perps/margin.md");
    expect(prompt.user).toContain("Cite sources like [1], [2]");
  });
});
