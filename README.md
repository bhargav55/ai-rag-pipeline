# AI RAG Pipeline

A production-style TypeScript/Bun RAG pipeline for perps and blockchain protocol documents.

This repo is built as an AI Engineer interview artifact: clean ingestion, citation-ready chunks, OpenAI embeddings, Qdrant vector DB storage, retrieval, prompt construction, and LLM answers with sources.

## Current pipeline

```txt
Protocol Docs
-> Loader
-> Chunker
-> OpenAI Embeddings
-> Qdrant Vector DB
-> Retriever
-> Prompt Builder
-> OpenAI Chat Model
-> Answer with Sources
```

## What this demonstrates

This project shows the core production RAG pattern:

```txt
Offline ingest path:
all docs -> chunks -> embeddings -> Qdrant

Online ask path:
question -> question embedding -> Qdrant cosine search -> top-k chunks -> LLM prompt -> answer + sources
```

Qdrant does not generate answers. It retrieves relevant source chunks.
The LLM generates the final answer, grounded by the retrieved chunks.

## Implemented

- Recursive `.md` / `.txt` document loader
- Unsupported-file filtering
- Stable source ordering
- Metadata for citations:
  - `sourcePath`
  - `extension`
  - `sizeBytes`
  - `domain`
- Fixed-size overlapping chunks
- Production OpenAI-compatible embeddings client
- Qdrant vector database store
- pgvector store kept as a Postgres-backed alternative
- In-memory vector store kept for tests/simple demos
- Retriever that embeds the user query and returns top-k matching chunks
- Prompt builder that combines retrieved context with user input
- Production OpenAI-compatible chat client
- End-to-end RAG answer orchestration
- RAG eval runner for retrieval quality and grounded answer checks
- Ragas framework eval stack for faithfulness, answer relevancy, context precision, and context recall
- Seed perps/risk docs
- Vitest tests
- CLI tools for load, retrieve, ingest, ask, and eval
- Python/uv Ragas evaluator for framework-based RAG metrics

## Stack

- TypeScript
- Bun
- Vitest
- Zod
- Qdrant vector database
- Optional Postgres + pgvector backend
- OpenAI-compatible embeddings/chat APIs
- Ragas for mature RAG evaluation metrics

## Models and retrieval config

Answer model:

```bash
CHAT_MODEL=gpt-5.5
```

Embedding model:

```bash
EMBEDDING_MODEL=text-embedding-3-small
```

Embedding dimension:

```bash
EMBEDDING_DIMENSION=1536
```

Vector search:

```txt
Qdrant distance = Cosine
```

Chunking:

```txt
maxChars: 800
overlapChars: 120
```

Meaning each document is split into chunks of up to 800 characters with 120 characters of overlap between neighboring chunks.

## Setup

Install dependencies:

```bash
bun install
```

Create a local `.env` file. Do not commit it.

```bash
export VECTOR_STORE=qdrant
export QDRANT_URL=https://qdrant-production-b4b4.up.railway.app
export QDRANT_COLLECTION=protocol_docs
export QDRANT_API_KEY=***
export EMBEDDING_DIMENSION=1536

export OPENAI_API_KEY=***
export OPENAI_BASE_URL=https://api.openai.com/v1
export EMBEDDING_MODEL=text-embedding-3-small
export CHAT_MODEL=gpt-5.5
```

Load env vars before running CLI commands:

```bash
source .env
```

## Commands

Run tests:

```bash
bun test
```

Typecheck:

```bash
bun run typecheck
```

Load docs without embeddings:

```bash
bun run load data/docs
```

Expected output for the current seed docs:

```json
{
  "docsDir": "data/docs",
  "documents": 4,
  "chunks": 20
}
```

One-shot retrieval without vector DB persistence:

```bash
bun run retrieve data/docs "what happens when margin falls below maintenance?" 2
```

Ingest docs into Qdrant:

```bash
bun run ingest data/docs
```

Expected output for the current seed docs:

```json
{
  "docsDir": "data/docs",
  "documents": 4,
  "chunks": 20,
  "store": "qdrant"
}
```

Ask a full RAG question using Qdrant + LLM answer generation:

```bash
bun run ask "what happens when margin falls below maintenance?" 3
```

The final argument is `topK`. For example, `3` means retrieve the top 3 most relevant chunks from Qdrant and pass those chunks to the LLM as context.

Example answer shape:

```json
{
  "store": "qdrant",
  "answer": "When account equity falls below the maintenance margin requirement, the position becomes eligible for liquidation [1].",
  "sources": [
    {
      "sourcePath": "perps/margin.md",
      "chunkId": "perps/margin.md#chunk-1",
      "score": 0.5373063
    },
    {
      "sourcePath": "risk/liquidation.md",
      "chunkId": "risk/liquidation.md#chunk-0",
      "score": 0.5180107
    }
  ]
}
```

Run deterministic RAG evals:

```bash
bun run eval evals/questions.json 3
```

The deterministic eval runner checks two things for each test question:

1. Retrieval quality: did Qdrant return the expected source docs?
2. Answer grounding sanity: did the LLM answer include required domain terms?

Example eval summary:

```json
{
  "summary": {
    "total": 4,
    "passed": 4,
    "failed": 0
  }
}
```

Run Ragas framework evals:

```bash
bun run eval:export evals/questions.json evals/ragas-dataset.jsonl 3
bun run eval:ragas
```

The Ragas stack exports the real RAG outputs into JSONL rows with:

- `user_input`
- `response`
- `retrieved_contexts`
- `reference`

Then the Python Ragas runner scores:

- faithfulness
- answer relevancy
- context precision
- context recall

For a plain-English explanation of how Ragas works, see [`docs/ragas-framework.md`](docs/ragas-framework.md).

The production answer model can remain `gpt-5.5`. The Ragas judge model defaults to `gpt-4o-mini` via `RAGAS_LLM_MODEL` because Ragas/LangChain may set low temperature internally, and newer GPT-5.5 APIs reject non-default temperature values.

## Checking Qdrant records

Count stored chunks:

```bash
curl -s \
  -X POST "$QDRANT_URL/collections/protocol_docs/points/count" \
  -H "api-key: $QDRANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"exact": true}' | jq
```

Expected count after a fresh ingest of the current seed docs:

```json
{
  "result": {
    "count": 20
  },
  "status": "ok"
}
```

View stored records without large vectors:

```bash
curl -s \
  -X POST "$QDRANT_URL/collections/protocol_docs/points/scroll" \
  -H "api-key: $QDRANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 5,
    "with_payload": true,
    "with_vector": false
  }' | jq
```

Delete the collection and start fresh:

```bash
curl -s \
  -X DELETE "$QDRANT_URL/collections/protocol_docs" \
  -H "api-key: $QDRANT_API_KEY" | jq

bun run ingest data/docs
```

Re-running ingest is idempotent for the same docs because chunks are upserted by stable chunk IDs. The count should stay at 20, not duplicate to 40.

## Hosted Qdrant on Railway

A Railway-hosted Qdrant service is available for production-style demos:

- Railway project: `ai-rag-qdrant`
- Railway service: `qdrant`
- Public URL: `https://qdrant-production-b4b4.up.railway.app`
- Persistent volume mount: `/qdrant/storage`
- Qdrant API key is configured on Railway as `QDRANT__SERVICE__API_KEY`
- Railway public routing uses `PORT=6333` and `QDRANT__SERVICE__HOST=0.0.0.0`

Use the hosted vector DB from this app:

```bash
export VECTOR_STORE=qdrant
export QDRANT_URL=https://qdrant-production-b4b4.up.railway.app
export QDRANT_COLLECTION=protocol_docs
export QDRANT_API_KEY=***
export EMBEDDING_DIMENSION=1536

bun run ingest data/docs
bun run ask "what happens when margin falls below maintenance?" 3
```

For local development, you can still run Qdrant with Docker:

```bash
docker compose up -d qdrant
export QDRANT_URL=http://localhost:6333
```

## Optional pgvector backend

Qdrant is the default separate vector database. If you want the Postgres-backed alternative:

```bash
docker compose up -d postgres
export VECTOR_STORE=pgvector
export DATABASE_URL=postgres://rag:***@localhost:5432/rag
bun run db:schema
bun run ingest data/docs
bun run ask "what happens when margin falls below maintenance?" 3
```

## Interview framing

I built a perps/blockchain RAG pipeline from first principles. The system loads protocol docs, chunks all documents with citation metadata, creates production OpenAI embeddings, stores vectors in Qdrant, retrieves top-k context with cosine similarity for user questions, builds a grounded prompt, and generates an answer with sources. The design keeps each stage testable and swappable: ingestion, chunking, embedding provider, vector store, retriever, prompt builder, and LLM client are separated. pgvector is also implemented as an alternate backend to show I understand both dedicated vector databases and Postgres-native vector search. The repo includes deterministic RAG regression evals plus a Ragas framework evaluator for faithfulness, answer relevancy, context precision, and context recall.

Important distinction:

- Qdrant/RAG retrieves the relevant source chunks.
- The LLM writes the final answer using those chunks.
- Returned sources make the answer auditable.

## Current verified demo

After ingesting `data/docs`, Qdrant stores 20 points:

```txt
4 documents -> 20 chunks -> 20 Qdrant records
```

A question like:

```bash
bun run ask "what happens when margin falls below maintenance?" 3
```

retrieves margin/liquidation chunks and returns a grounded answer with source metadata.

RAG evals are also verified:

```bash
bun run eval evals/questions.json 3
```

Current deterministic result:

```txt
4 eval cases -> 4 passed -> 0 failed
```

Ragas framework evals are also wired and verified:

```bash
bun run eval:export evals/questions.json evals/ragas-dataset.jsonl 3
bun run eval:ragas
```

Latest Ragas report was generated with 4 rows and these metrics:

```txt
faithfulness
answer_relevancy
llm_context_precision_without_reference
context_recall
```

## Next milestones

1. Add ingestion cache so unchanged docs are not re-embedded.
2. Add section-aware markdown chunking instead of fixed-character chunking.
3. Add structured JSON answer validation with Zod.
4. Add tracing/logging for retrieval scores and selected sources.
5. Add CI workflow for tests and typecheck.
6. Add streaming answers.
7. Add a small HTTP API endpoint like `POST /ask`.
