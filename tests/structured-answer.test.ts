import { describe, expect, it } from "vitest";
import { parseStructuredRagAnswer } from "../src/structured-answer";

describe("parseStructuredRagAnswer", () => {
  it("validates structured JSON answers from the LLM", () => {
    expect(
      parseStructuredRagAnswer(`{
        "answer": "Liquidation happens below maintenance margin [1].",
        "confidence": "high",
        "citations": [{ "sourceNumber": 1 }],
        "missingContext": false
      }`),
    ).toEqual({
      answer: "Liquidation happens below maintenance margin [1].",
      confidence: "high",
      citations: [{ sourceNumber: 1 }],
      missingContext: false,
    });
  });

  it("extracts JSON from fenced LLM responses", () => {
    expect(
      parseStructuredRagAnswer(`Here is the answer:\n\n\`\`\`json\n{
        "answer": "The context is insufficient to answer fully.",
        "confidence": "low",
        "citations": [],
        "missingContext": true
      }\n\`\`\``),
    ).toEqual({
      answer: "The context is insufficient to answer fully.",
      confidence: "low",
      citations: [],
      missingContext: true,
    });
  });

  it("rejects malformed answer contracts", () => {
    expect(() =>
      parseStructuredRagAnswer(`{
        "answer": "Liquidation happens.",
        "confidence": "pretty sure"
      }`),
    ).toThrow(/Invalid structured RAG answer/);
  });
});
