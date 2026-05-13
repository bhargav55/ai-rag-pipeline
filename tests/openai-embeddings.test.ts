import { describe, expect, it } from "vitest";
import { OpenAIEmbeddingClient } from "../src/embeddings/openai";

describe("OpenAIEmbeddingClient", () => {
  it("calls OpenAI-compatible embeddings API and preserves input order", async () => {
    const calls: unknown[] = [];
    const fetchFn = async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: [0, 1] },
            { index: 0, embedding: [1, 0] },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const client = new OpenAIEmbeddingClient({
      apiKey: "test-key",
      model: "text-embedding-3-small",
      fetchFn,
    });

    await expect(client.embed(["funding", "oracle"])).resolves.toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(calls).toEqual([
      {
        model: "text-embedding-3-small",
        input: ["funding", "oracle"],
      },
    ]);
  });

  it("raises useful errors for failed embedding requests", async () => {
    const client = new OpenAIEmbeddingClient({
      apiKey: "test-key",
      fetchFn: async () => new Response("bad key", { status: 401 }),
    });

    await expect(client.embed(["funding"])).rejects.toThrow(
      "Embedding request failed: 401 bad key",
    );
  });
});
