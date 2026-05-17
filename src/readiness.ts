import postgres from "postgres";

export type ReadinessCheckName = "env" | "qdrant" | "postgres" | "models";

export type ReadinessCheck = {
  name: ReadinessCheckName;
  ok: boolean;
  message?: string;
};

export type ReadinessResult = {
  ok: boolean;
  checks: ReadinessCheck[];
};

type ReadinessDb = {
  unsafe(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  end?: () => Promise<void>;
};

type ReadinessFetch = (url: string, init?: RequestInit) => Promise<Response>;

type ReadinessEnv = Record<string, string | undefined>;

type CheckReadinessDeps = {
  env?: ReadinessEnv;
  fetch?: ReadinessFetch;
  createDb?: (databaseUrl: string) => ReadinessDb;
};

const REQUIRED_ENV = ["OPENAI_API_KEY", "QDRANT_URL", "QDRANT_COLLECTION", "DATABASE_URL"];

const normalizeUrl = (url: string): string => url.replace(/\/$/, "");

const missingRequiredEnv = (env: ReadinessEnv): string[] =>
  REQUIRED_ENV.filter((name) => !env[name] || String(env[name]).trim() === "");

const modelCheck = (env: ReadinessEnv): ReadinessCheck => {
  const embeddingModel = env.EMBEDDING_MODEL ?? "text-embedding-3-small";
  const chatModel = env.CHAT_MODEL ?? "gpt-5.5";
  const embeddingDimension = Number(env.EMBEDDING_DIMENSION ?? "1536");

  if (!embeddingModel || !chatModel || !Number.isFinite(embeddingDimension) || embeddingDimension <= 0) {
    return { name: "models", ok: false, message: "Invalid embedding/chat model configuration" };
  }

  return { name: "models", ok: true };
};

const checkQdrant = async (env: ReadinessEnv, fetchFn: ReadinessFetch): Promise<ReadinessCheck> => {
  const url = normalizeUrl(env.QDRANT_URL ?? "");
  const collection = env.QDRANT_COLLECTION ?? "";
  const headers: Record<string, string> = {};
  if (env.QDRANT_API_KEY) headers["api-key"] = env.QDRANT_API_KEY;

  try {
    const response = await fetchFn(`${url}/collections/${encodeURIComponent(collection)}`, { headers });
    if (!response.ok) {
      return { name: "qdrant", ok: false, message: `Qdrant collection check failed with HTTP ${response.status}` };
    }
    return { name: "qdrant", ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { name: "qdrant", ok: false, message };
  }
};

const checkPostgres = async (env: ReadinessEnv, createDb: (databaseUrl: string) => ReadinessDb): Promise<ReadinessCheck> => {
  let db: ReadinessDb | undefined;
  try {
    db = createDb(env.DATABASE_URL ?? "");
    const rows = await db.unsafe("select to_regclass('public.rag_documents') is not null as table_exists");
    if (!rows[0]?.table_exists) {
      return {
        name: "postgres",
        ok: false,
        message: "rag_documents table is missing; run bun run db:schema before ingest/serve",
      };
    }
    return { name: "postgres", ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { name: "postgres", ok: false, message };
  } finally {
    await db?.end?.();
  }
};

export const checkReadiness = async (deps: CheckReadinessDeps = {}): Promise<ReadinessResult> => {
  const env = deps.env ?? Bun.env;
  const fetchFn = deps.fetch ?? fetch;
  const createDb = deps.createDb ?? ((databaseUrl: string) => postgres(databaseUrl, { max: 1 }));

  const missing = missingRequiredEnv(env);
  const checks: ReadinessCheck[] = [];

  if (missing.length > 0) {
    checks.push({ name: "env", ok: false, message: `Missing required env vars: ${missing.join(", ")}` });
    checks.push(modelCheck(env));
    return { ok: false, checks };
  }

  checks.push({ name: "env", ok: true });
  checks.push(await checkQdrant(env, fetchFn));
  checks.push(await checkPostgres(env, createDb));
  checks.push(modelCheck(env));

  return { ok: checks.every((check) => check.ok), checks };
};
