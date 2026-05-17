const main = async () => {
  const url = Bun.env.QDRANT_URL;
  const collection = Bun.env.QDRANT_COLLECTION ?? "protocol_docs";
  const apiKey = Bun.env.QDRANT_API_KEY;

  if (!url) throw new Error("QDRANT_URL is required");

  const response = await fetch(`${url.replace(/\/$/, "")}/collections/${encodeURIComponent(collection)}`, {
    method: "DELETE",
    headers: apiKey ? { "api-key": apiKey } : undefined,
  });

  const text = await response.text();
  if (!response.ok && response.status !== 404) {
    throw new Error(`Qdrant collection delete failed with HTTP ${response.status}: ${text}`);
  }

  console.log(JSON.stringify({ ok: true, collection, status: response.status }, null, 2));
};

await main();

export {};
