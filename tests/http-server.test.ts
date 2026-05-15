import { describe, expect, it } from "vitest";
import { handleHttpRequest } from "../src/http-server";

describe("handleHttpRequest", () => {
  it("answers POST /ask with validated request JSON", async () => {
    const response = await handleHttpRequest(
      new Request("http://localhost/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "When does liquidation happen?", topK: 2 }),
      }),
      {
        async answer({ question, topK }) {
          return {
            answer: `answered: ${question}`,
            confidence: "high",
            citations: [{ sourceNumber: 1 }],
            missingContext: false,
            sources: [{ sourcePath: "risk/liquidation.md", chunkId: "risk/liquidation.md#chunk-0", score: 0.95 }],
            topK,
          };
        },
      },
    );

    await expect(response.json()).resolves.toEqual({
      answer: "answered: When does liquidation happen?",
      confidence: "high",
      citations: [{ sourceNumber: 1 }],
      missingContext: false,
      sources: [{ sourcePath: "risk/liquidation.md", chunkId: "risk/liquidation.md#chunk-0", score: 0.95 }],
      topK: 2,
    });
    expect(response.status).toBe(200);
  });

  it("rejects invalid ask requests", async () => {
    const response = await handleHttpRequest(
      new Request("http://localhost/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "", topK: 0 }),
      }),
      {
        async answer() {
          throw new Error("should not be called");
        },
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid request" });
  });

  it("exposes GET /healthz", async () => {
    const response = await handleHttpRequest(new Request("http://localhost/healthz"), {
      async answer() {
        throw new Error("should not be called");
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
