import { describe, expect, it } from "vitest";
import { checkReadiness } from "../src/readiness";

type FetchCall = {
  url: string;
  init?: RequestInit;
};

const readyEnv = {
  OPENAI_API_KEY: "test-openai-key",
  QDRANT_URL: "https://qdrant.example.com",
  QDRANT_COLLECTION: "protocol_docs",
  DATABASE_URL: "postgres://user:pass@localhost:5432/rag",
  EMBEDDING_MODEL: "text-embedding-3-small",
  CHAT_MODEL: "gpt-5.5",
};

const okDb = {
  unsafe: async () => [{ table_exists: true }],
};

describe("checkReadiness", () => {
  it("passes when required env, Qdrant collection, and Postgres registry table are ready", async () => {
    const calls: FetchCall[] = [];
    const result = await checkReadiness({
      env: readyEnv,
      fetch: async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify({ result: { status: "green" } }), { status: 200 });
      },
      createDb: () => okDb,
    });

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual([
      { name: "env", ok: true },
      { name: "qdrant", ok: true },
      { name: "postgres", ok: true },
      { name: "models", ok: true },
    ]);
    expect(calls[0].url).toBe("https://qdrant.example.com/collections/protocol_docs");
  });

  it("fails when required production env vars are missing", async () => {
    const result = await checkReadiness({
      env: { QDRANT_URL: "https://qdrant.example.com" },
      fetch: async () => new Response("should not be called", { status: 500 }),
      createDb: () => okDb,
    });

    expect(result.ok).toBe(false);
    expect(result.checks[0]).toEqual({
      name: "env",
      ok: false,
      message: "Missing required env vars: OPENAI_API_KEY, QDRANT_COLLECTION, DATABASE_URL",
    });
  });

  it("fails when Qdrant collection is not reachable", async () => {
    const result = await checkReadiness({
      env: readyEnv,
      fetch: async () => new Response(JSON.stringify({ status: { error: "not found" } }), { status: 404 }),
      createDb: () => okDb,
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.name === "qdrant")).toEqual({
      name: "qdrant",
      ok: false,
      message: "Qdrant collection check failed with HTTP 404",
    });
  });

  it("fails when Postgres cannot see rag_documents", async () => {
    const result = await checkReadiness({
      env: readyEnv,
      fetch: async () => new Response(JSON.stringify({ result: true }), { status: 200 }),
      createDb: () => ({
        unsafe: async () => [{ table_exists: false }],
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.name === "postgres")).toEqual({
      name: "postgres",
      ok: false,
      message: "rag_documents table is missing; run bun run db:schema before ingest/serve",
    });
  });
});
