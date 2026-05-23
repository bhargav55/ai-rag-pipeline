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

  it("answers POST /agent/ask with validated agent request JSON", async () => {
    const response = await handleHttpRequest(
      new Request("http://localhost/agent/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "How does the protocol handle TP/SL jobs?", topK: 5, maxTurns: 4 }),
      }),
      {
        async answer() {
          throw new Error("should not be called");
        },
        async agentAnswer({ question, topK, maxTurns }) {
          return {
            answer: `agent answered: ${question}`,
            confidence: "medium",
            citations: [{ sourceNumber: 1 }],
            missingContext: false,
            sources: [{ sourcePath: "automation/tpsl.md", chunkId: "automation/tpsl.md#chunk-0", score: 0.88 }],
            turns: maxTurns,
            topK,
          };
        },
      },
    );

    await expect(response.json()).resolves.toEqual({
      answer: "agent answered: How does the protocol handle TP/SL jobs?",
      confidence: "medium",
      citations: [{ sourceNumber: 1 }],
      missingContext: false,
      sources: [{ sourcePath: "automation/tpsl.md", chunkId: "automation/tpsl.md#chunk-0", score: 0.88 }],
      turns: 4,
      topK: 5,
    });
    expect(response.status).toBe(200);
  });

  it("rejects invalid agent ask requests", async () => {
    const response = await handleHttpRequest(
      new Request("http://localhost/agent/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "", maxTurns: 0 }),
      }),
      {
        async answer() {
          throw new Error("should not be called");
        },
        async agentAnswer() {
          throw new Error("should not be called");
        },
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid request" });
  });

  it("returns 503 for POST /agent/ask when the agent handler is not configured", async () => {
    const response = await handleHttpRequest(
      new Request("http://localhost/agent/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "What can you answer?" }),
      }),
      {
        async answer() {
          throw new Error("should not be called");
        },
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Agent endpoint not configured" });
  });

  it("exposes GET /healthz", async () => {
    const response = await handleHttpRequest(new Request("http://localhost/healthz"), {
      async answer() {
        throw new Error("should not be called");
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("handles browser CORS preflight requests", async () => {
    const response = await handleHttpRequest(
      new Request("http://localhost/agent/ask", {
        method: "OPTIONS",
        headers: {
          "access-control-request-headers": "content-type",
          "access-control-request-method": "POST",
          origin: "https://bhargav-kacharla.com",
        },
      }),
      {
        async answer() {
          throw new Error("should not be called");
        },
      },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("exposes GET /readyz with dependency readiness details", async () => {
    const response = await handleHttpRequest(new Request("http://localhost/readyz"), {
      async answer() {
        throw new Error("should not be called");
      },
      async readiness() {
        return {
          ok: true,
          checks: [
            { name: "env", ok: true },
            { name: "qdrant", ok: true },
            { name: "postgres", ok: true },
            { name: "models", ok: true },
          ],
        };
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      checks: [
        { name: "env", ok: true },
        { name: "qdrant", ok: true },
        { name: "postgres", ok: true },
        { name: "models", ok: true },
      ],
    });
  });

  it("returns 503 from GET /readyz when a readiness dependency fails", async () => {
    const response = await handleHttpRequest(new Request("http://localhost/readyz"), {
      async answer() {
        throw new Error("should not be called");
      },
      async readiness() {
        return {
          ok: false,
          checks: [{ name: "postgres", ok: false, message: "connection failed" }],
        };
      },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      checks: [{ name: "postgres", ok: false, message: "connection failed" }],
    });
  });
});
