import postgres from "postgres";
import { OpenAIEmbeddingClient } from "../embeddings/openai";
import { OpenAIChatClient } from "../llm/openai-chat";
import { answerWithRag } from "../rag";
import { PgVectorStore } from "../stores/pg-vector-store";

const main = async () => {
  const [question, topKArg] = Bun.argv.slice(2);
  if (!question) {
    console.error("Usage: bun run ask <question> [topK]");
    process.exit(1);
  }
  if (!Bun.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for pgvector RAG answers");
  }

  const db = postgres(Bun.env.DATABASE_URL);
  const response = await answerWithRag({
    question,
    embeddingClient: new OpenAIEmbeddingClient(),
    store: new PgVectorStore(db),
    llmClient: new OpenAIChatClient(),
    topK: topKArg ? Number(topKArg) : 3,
  });
  await db.end();

  console.log(JSON.stringify(response, null, 2));
};

await main();
