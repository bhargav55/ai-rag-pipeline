import { describe, expect, it } from "vitest";
import { OpenAIChatClient } from "../src/llm/openai-chat";

describe("OpenAIChatClient", () => {
  it("uses gpt-5.5 as the default chat model", async () => {
    const previousModel = Bun.env.CHAT_MODEL;
    delete Bun.env.CHAT_MODEL;
    const calls: unknown[] = [];
    const client = new OpenAIChatClient({
      apiKey: "test-key",
      fetchFn: async (_url, init) => {
        calls.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ choices: [{ message: { content: "answer" } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    await client.answer({ system: "system", user: "user" });

    expect(calls).toMatchObject([{ model: "gpt-5.5" }]);
    if (previousModel) Bun.env.CHAT_MODEL = previousModel;
  });

  it("calls OpenAI-compatible chat completions API", async () => {
    const calls: unknown[] = [];
    const client = new OpenAIChatClient({
      apiKey: "test-key",
      model: "gpt-4o-mini",
      fetchFn: async (_url, init) => {
        calls.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "Liquidation happens below maintenance margin [1]." } }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    await expect(client.answer({ system: "system", user: "user" })).resolves.toBe(
      "Liquidation happens below maintenance margin [1].",
    );
    expect(calls).toEqual([
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "system" },
          { role: "user", content: "user" },
        ],
      },
    ]);
  });

  it("raises useful errors for failed chat requests", async () => {
    const client = new OpenAIChatClient({
      apiKey: "test-key",
      fetchFn: async () => new Response("rate limited", { status: 429 }),
    });

    await expect(client.answer({ system: "system", user: "user" })).rejects.toThrow(
      "Chat request failed: 429 rate limited",
    );
  });
});
