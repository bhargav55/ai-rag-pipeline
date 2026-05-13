import type { EmbeddingClient } from "../types";

type OpenAIEmbeddingClientOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchFn?: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

type EmbeddingResponse = {
  data: Array<{
    index: number;
    embedding: number[];
  }>;
};

export class OpenAIEmbeddingClient implements EmbeddingClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchFn: (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

  constructor(options: OpenAIEmbeddingClientOptions = {}) {
    this.apiKey = options.apiKey ?? Bun.env.OPENAI_API_KEY ?? "";
    this.model = options.model ?? Bun.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
    this.baseUrl = options.baseUrl ?? Bun.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
    this.fetchFn = options.fetchFn ?? fetch;

    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is required for production embeddings");
    }
  }

  async embed(input: string[]): Promise<number[][]> {
    if (input.length === 0) return [];

    const response = await this.fetchFn(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding request failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as EmbeddingResponse;
    return payload.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }
}
