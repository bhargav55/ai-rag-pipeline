import postgres from "postgres";

const main = async () => {
  const databaseUrl = Bun.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const db = postgres(databaseUrl, { max: 1 });
  try {
    const rows = await db.unsafe<{ deleted: number }[]>("delete from rag_documents returning 1 as deleted");
    console.log(JSON.stringify({ ok: true, deletedDocuments: rows.length }, null, 2));
  } finally {
    await db.end();
  }
};

await main();
