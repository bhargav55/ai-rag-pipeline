import { readFile } from "node:fs/promises";
import postgres from "postgres";

const main = async () => {
  const databaseUrl = Bun.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to apply db/schema.sql");
  }

  const schemaSql = await readFile("db/schema.sql", "utf8");
  const db = postgres(databaseUrl, { max: 1 });

  try {
    await db.unsafe(schemaSql);
  } finally {
    await db.end();
  }

  console.log(JSON.stringify({ ok: true, schema: "db/schema.sql" }, null, 2));
};

await main();
