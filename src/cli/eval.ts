import { evaluateRag, summarizeEvalResults, type RagEvalCase } from "../evals";
import { OpenAIEmbeddingClient } from "../embeddings/openai";
import { OpenAIChatClient } from "../llm/openai-chat";
import { QdrantVectorStore } from "../stores/qdrant-vector-store";
import type { VectorSearchStore } from "../types";

type EvalStore = {
  name: "qdrant";
  store: VectorSearchStore;
  close(): Promise<void>;
};

const embeddingDimension = () => Number(Bun.env.EMBEDDING_DIMENSION ?? "1536");

const createStore = (): EvalStore => {
  const vectorStore = Bun.env.VECTOR_STORE ?? "qdrant";
  if (vectorStore !== "qdrant") {
    throw new Error(`Unsupported VECTOR_STORE: ${vectorStore}. Use qdrant.`);
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
  const results = await evaluateRag({
    cases,
    topK,
    embeddingClient: new OpenAIEmbeddingClient(),
    store,
    llmClient: new OpenAIChatClient(),
  });
  await close();

  const summary = summarizeEvalResults(results);
  console.log(JSON.stringify({ store: name, evalPath, topK, summary, results }, null, 2));

  if (summary.failed > 0) process.exit(1);
};

await main();
