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
-> Zod Validation
-> Answer with Sources
-> Structured Trace Log
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
- Section-aware Markdown chunking with heading-path metadata
- Fixed-size overlapping chunks for plain text and oversized Markdown sections
- Production OpenAI-compatible embeddings client
- Qdrant vector database store
- pgvector store kept as a Postgres-backed alternative
- In-memory vector store kept for tests/simple demos
- Retriever that embeds the user query and returns top-k matching chunks
- Prompt builder that combines retrieved context with user input
- Production OpenAI-compatible chat client
- End-to-end RAG answer orchestration
- Zod-validated structured LLM answers with confidence, citations, and missing-context flags
- HTTP API with `POST /ask` and `GET /healthz`
- Structured RAG tracing/logging with request IDs, retrieval metadata, stage timings, and error events
- JSON logger with log levels, timestamps, and secret-field redaction
- RAG eval runner for retrieval quality and grounded answer checks
- Ragas-compatible JSONL export for framework-based RAG quality evaluation
- Seed perps/risk docs
- Protocol-specific configuration docs for margin ratios, fees, liquidator incentives, and leverage limits
- Vitest tests
- CLI tools for load, retrieve, ingest, ask, and eval


## Stack

- TypeScript
- Bun
- Vitest
- Zod
- Qdrant vector database
- Optional Postgres + pgvector backend
- OpenAI-compatible embeddings/chat APIs
- Ragas-compatible eval dataset export

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

Meaning each Markdown document is first split by headings so chunks preserve section boundaries and heading paths. Oversized sections and plain text files are split into chunks of up to 800 characters with 120 characters of overlap between neighboring chunks.

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
  "documents": 5,
  "chunks": 32
}
```

One-shot retrieval without vector DB persistence:

```bash
bun run retrieve data/docs "what is this protocol's maintenance margin ratio and fee schedule?" 3
```

This is intentionally protocol-specific. The seed corpus includes `data/docs/protocol/configuration.md`, which defines baseline parameters that generic model pretraining should not guess:

```txt
maintenance margin ratio = 6%
maker fee = 0.01%
taker fee = 0.05%
liquidator fee = 1.00%
maximum leverage = 10x
minimum leverage = 1x
```

Generic perps knowledge is useful background, but answers about these parameters should be grounded in the protocol configuration doc.

You can also test the older generic margin question:

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
  "documents": 5,
  "chunks": 32,
  "store": "qdrant"
}
```

Ask a full RAG question using Qdrant + LLM answer generation:

```bash
bun run ask "what are the protocol maintenance margin ratio, fees, and leverage limits?" 3
```

The final argument is `topK`. For example, `3` means retrieve the top 3 most relevant chunks from Qdrant and pass those chunks to the LLM as context.

The LLM is instructed to return only valid JSON. The app validates that JSON with Zod before trusting it, so malformed model output fails fast instead of leaking into downstream API responses.

Run the HTTP API:

```bash
bun run serve
```

Health check:

```bash
curl http://localhost:3000/healthz | jq
```

Ask through the API:

```bash
curl -s \
  -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"what are the protocol maintenance margin ratio, fees, and leverage limits?","topK":3}' | jq
```

Example answer shape:

```json
{
  "store": "qdrant",
  "traceId": "7b8717f5-9d3e-4ea7-8c6b-a5cf7a4515a3",
  "answer": "The protocol baseline maintenance margin ratio is 6%. The maker fee is 0.01%, the taker fee is 0.05%, the liquidator fee is 1.00%, and baseline leverage ranges from 1x to 10x [1].",
  "confidence": "high",
  "citations": [
    {
      "sourceNumber": 1
    }
  ],
  "missingContext": false,
  "sources": [
    {
      "sourcePath": "protocol/configuration.md",
      "chunkId": "protocol/configuration.md#section-risk-parameters-chunk-0",
      "score": 0.5373063
    },
    {
      "sourcePath": "protocol/configuration.md",
      "chunkId": "protocol/configuration.md#section-fee-parameters-chunk-0",
      "score": 0.5180107
    }
  ]
}
```

Structured tracing/logging:

Each `bun run ask` and `POST /ask` call emits one JSON log line to stderr through the shared logger. HTTP requests reuse the `x-request-id` header when present; otherwise the server generates a UUID. The same ID is returned in the API response as `traceId`, so app responses can be matched to logs.

Successful requests are logged at `info` level with `rag.answer.completed`. Failed RAG calls are logged at `error` level with `rag.answer.failed` and a redacted-safe error name/message. The logger adds `timestamp`, `level`, and `message` fields and redacts obvious secret fields such as API keys, authorization headers, tokens, passwords, and credentials.

Example trace event:

```json
{
  "timestamp": "2026-05-15T00:00:00.000Z",
  "level": "info",
  "message": "rag.answer.completed",
  "event": "rag.answer.completed",
  "requestId": "7b8717f5-9d3e-4ea7-8c6b-a5cf7a4515a3",
  "question": "what happens when margin falls below maintenance?",
  "topK": 3,
  "model": "gpt-5.5",
  "retrievedChunks": [
    {
      "chunkId": "perps/margin.md#section-margin-requirements-chunk-0",
      "sourcePath": "perps/margin.md",
      "headingPath": ["Margin", "Requirements"],
      "score": 0.5373063
    }
  ],
  "timingsMs": {
    "embedding": 82,
    "vectorSearch": 34,
    "promptBuild": 1,
    "llm": 1640,
    "validation": 2,
    "total": 1759
  }
}
```

The trace is intentionally operational: request ID, question, `topK`, chat model, retrieved source chunks, optional heading paths, similarity scores, per-stage latency, and errors. The logger redacts obvious secret fields before writing JSON lines, so API keys and vector database credentials are not logged.

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

Export Ragas-compatible eval rows:

```bash
bun run eval:export evals/questions.json evals/ragas-dataset.jsonl 3
```

The export command runs the real RAG path and writes JSONL rows with:

- `user_input`
- `response`
- `retrieved_contexts`
- `reference`

Those rows can be used by external RAG evaluation tools to score:

- faithfulness
- answer relevancy
- context precision
- context recall

For a plain-English explanation of how Ragas works, see [`docs/ragas-framework.md`](docs/ragas-framework.md).

The production answer model remains `gpt-5.5`.

## Checking Qdrant records

Count stored chunks:

```bash
curl -s \
  -X POST "$QDRANT_URL/collections/protocol_docs/points/count" \
  -H "api-key: $QDRANT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"exact": true}' | jq
```

Expected count after deleting the collection and running a fresh ingest of the current seed docs:

```json
{
  "result": {
    "count": 27
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

Re-running ingest is idempotent for the same docs because chunks are upserted by stable chunk IDs. The count should stay at 32, not duplicate to 64.

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
bun run ask "what are the protocol maintenance margin ratio, fees, and leverage limits?" 3
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
bun run ask "what are the protocol maintenance margin ratio, fees, and leverage limits?" 3
```

## Interview framing

I built a perps/blockchain RAG pipeline from first principles. The system loads protocol docs, chunks Markdown by section with citation metadata, creates production OpenAI embeddings, stores vectors in Qdrant, retrieves top-k context with cosine similarity for user questions, builds a grounded prompt, validates structured LLM JSON with Zod, and returns an answer with sources. The design keeps each stage testable and swappable: ingestion, chunking, embedding provider, vector store, retriever, prompt builder, LLM client, and HTTP API are separated. pgvector is also implemented as an alternate backend to show I understand both dedicated vector databases and Postgres-native vector search. The repo includes deterministic RAG regression evals plus Ragas-compatible JSONL export for semantic evaluation workflows.

Important distinction:

- Qdrant/RAG retrieves the relevant source chunks.
- The LLM writes the final answer using those chunks.
- Returned sources make the answer auditable.

## Current local corpus check

`bun run load data/docs` currently reports 5 documents and 32 section-aware chunks:

```txt
5 documents -> 32 section-aware chunks
```

A question like:

```bash
bun run ask "what are the protocol maintenance margin ratio, fees, and leverage limits?" 3
```

retrieves protocol configuration chunks and returns a grounded answer with exact source metadata.

RAG evals include this protocol-specific config case:

```bash
bun run eval evals/questions.json 3
```

Expected deterministic result after ingesting the current corpus:

```txt
5 eval cases -> 5 passed -> 0 failed
```

Ragas-compatible eval export is also wired:

```bash
bun run eval:export evals/questions.json evals/ragas-dataset.jsonl 3
```

The export now generates 5 JSONL rows with question, response, retrieved contexts, and reference answer fields after running against the current corpus.

## Next milestones

1. Add deploy config for the HTTP API.
2. Add ingestion cache so unchanged docs are not re-embedded.
3. Add CI workflow for tests and typecheck.
4. Add streaming answers.
