import postgres from "postgres";
import { evaluateRag, type RagEvalCase } from "../evals";
import { OpenAIEmbeddingClient } from "../embeddings/openai";
import { judgeRagEvalResults, summarizeJudgeResults } from "../judge-evals";
import { OpenAIChatClient } from "../llm/openai-chat";
import { PgVectorStore } from "../stores/pg-vector-store";
import { QdrantVectorStore } from "../stores/qdrant-vector-store";
import type { VectorSearchStore } from "../types";

type EvalStore = {
  name: "qdrant" | "pgvector";
  store: VectorSearchStore;
  close(): Promise<void>;
};

const embeddingDimension = () => Number(Bun.env.EMBEDDING_DIMENSION ?? "1536");

const createStore = (): EvalStore => {
  const vectorStore = Bun.env.VECTOR_STORE ?? "qdrant";

  if (vectorStore === "pgvector") {
    if (!Bun.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when VECTOR_STORE=pgvector");
    }
    const db = postgres(Bun.env.DATABASE_URL);
    return {
      name: "pgvector",
      store: new PgVectorStore(db),
      close: () => db.end(),
    };
  }

  if (vectorStore !== "qdrant") {
    throw new Error(`Unsupported VECTOR_STORE: ${vectorStore}. Use qdrant or pgvector.`);
  }

  return {
    name: "qdrant",
    store: new QdrantVectorStore({
      url: Bun.env.QDRANT_URL ?? "http://localhost:6333",
      collection: Bun.env.QDRANT_COLLECTION ?? "protocol_docs",
      dimension: embeddingDimension(),
      apiKey: Bun.env.QDRANT_API_KEY,
    }),
    close: async () => {},
  };
};

const loadEvalCases = async (path: string): Promise<RagEvalCase[]> => {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`Eval file does not exist: ${path}`);
  return (await file.json()) as RagEvalCase[];
};

const main = async () => {
  const [evalPath = "evals/questions.json", topKArg] = Bun.argv.slice(2);
  const topK = topKArg ? Number(topKArg) : 3;
  if (!Number.isFinite(topK) || topK <= 0) throw new Error("topK must be a positive number");

  const cases = await loadEvalCases(evalPath);
  const { store, close, name } = createStore();
  const ragResults = await evaluateRag({
    cases,
    topK,
    embeddingClient: new OpenAIEmbeddingClient(),
    store,
    llmClient: new OpenAIChatClient(),
  });
  await close();

  const judgeModel = Bun.env.JUDGE_MODEL ?? Bun.env.CHAT_MODEL ?? "gpt-5.5";
  const judgedResults = await judgeRagEvalResults({
    results: ragResults,
    judgeClient: new OpenAIChatClient({ model: judgeModel }),
  });
  const judgeSummary = summarizeJudgeResults(judgedResults);

  console.log(
    JSON.stringify(
      {
        store: name,
        evalPath,
        topK,
        judgeModel,
        summary: judgeSummary,
        results: judgedResults,
      },
      null,
      2,
    ),
  );

  if (judgeSummary.failed > 0) process.exit(1);
};

await main();
