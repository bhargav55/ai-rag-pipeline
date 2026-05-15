import { describe, expect, it } from "vitest";
import { createJsonLogger } from "../src/logger";
import { createLoggerTracer } from "../src/rag-tracing";
import type { RagTraceEvent } from "../src/types";

const traceEvent: RagTraceEvent = {
  event: "rag.answer.completed",
  requestId: "req-1",
  question: "When does liquidation happen?",
  topK: 3,
  model: "gpt-5.5",
  retrievedChunks: [
    {
      chunkId: "risk/liquidation.md#chunk-0",
      sourcePath: "risk/liquidation.md",
      headingPath: ["Risk", "Liquidation"],
      score: 0.95,
    },
  ],
  timingsMs: {
    embedding: 10,
    vectorSearch: 20,
    promptBuild: 1,
    llm: 100,
    validation: 2,
    total: 133,
  },
};

describe("createJsonLogger", () => {
  it("writes structured JSON log lines with level, message, timestamp, and fields", () => {
    const lines: string[] = [];
    const logger = createJsonLogger({
      nowIso: () => "2026-05-15T00:00:00.000Z",
      write: (line) => lines.push(line),
    });

    logger.info("rag.answer.completed", { requestId: "req-1", topK: 3 });

    expect(lines).toEqual([
      JSON.stringify({
        timestamp: "2026-05-15T00:00:00.000Z",
        level: "info",
        message: "rag.answer.completed",
        requestId: "req-1",
        topK: 3,
      }),
    ]);
  });

  it("redacts obvious secret fields before writing logs", () => {
    const lines: string[] = [];
    const logger = createJsonLogger({
      nowIso: () => "2026-05-15T00:00:00.000Z",
      write: (line) => lines.push(line),
    });

    logger.error("config.loaded", {
      OPENAI_API_KEY: "sk-secret",
      qdrantApiKey: "qdrant-secret",
      nested: { authorization: "Bearer secret", safe: "ok" },
    });

    expect(JSON.parse(lines[0])).toEqual({
      timestamp: "2026-05-15T00:00:00.000Z",
      level: "error",
      message: "config.loaded",
      OPENAI_API_KEY: "[REDACTED]",
      qdrantApiKey: "[REDACTED]",
      nested: { authorization: "[REDACTED]", safe: "ok" },
    });
  });
});

describe("createLoggerTracer", () => {
  it("emits RAG trace events through the logger instead of writing directly to console", () => {
    const lines: string[] = [];
    const logger = createJsonLogger({
      nowIso: () => "2026-05-15T00:00:00.000Z",
      write: (line) => lines.push(line),
    });
    const tracer = createLoggerTracer({ requestId: "req-1", model: "gpt-5.5", logger });

    tracer.log(traceEvent);

    expect(JSON.parse(lines[0])).toEqual({
      timestamp: "2026-05-15T00:00:00.000Z",
      level: "info",
      message: "rag.answer.completed",
      ...traceEvent,
    });
  });

  it("logs failed RAG trace events at error level", () => {
    const lines: string[] = [];
    const logger = createJsonLogger({
      nowIso: () => "2026-05-15T00:00:00.000Z",
      write: (line) => lines.push(line),
    });
    const tracer = createLoggerTracer({ requestId: "req-1", model: "gpt-5.5", logger });

    tracer.log({
      ...traceEvent,
      event: "rag.answer.failed",
      error: { name: "Error", message: "LLM unavailable" },
    });

    expect(JSON.parse(lines[0])).toMatchObject({
      level: "error",
      message: "rag.answer.failed",
      event: "rag.answer.failed",
      error: { name: "Error", message: "LLM unavailable" },
    });
  });
});
