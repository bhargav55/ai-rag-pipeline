import type { LlmClient, LlmPrompt } from "../types";

type OpenAIChatClientOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchFn?: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

type ChatResponse = {
  choices: Array<{ message?: { content?: string } }>;
};

export class OpenAIChatClient implements LlmClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchFn: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

  constructor(options: OpenAIChatClientOptions = {}) {
    this.apiKey = options.apiKey ?? Bun.env.OPENAI_API_KEY ?? "";
    this.model = options.model ?? Bun.env.CHAT_MODEL ?? "gpt-4o-mini";
    this.baseUrl = options.baseUrl ?? Bun.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
    this.fetchFn = options.fetchFn ?? fetch;

    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is required for LLM answers");
    }
  }

  async answer(prompt: LlmPrompt): Promise<string> {
    const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as ChatResponse;
    const content = payload.choices[0]?.message?.content;
    if (!content) throw new Error("Chat response did not include message content");
    return content;
  }
}
