# AI RAG Pipeline

A production-style TypeScript/Bun RAG pipeline for perps and blockchain protocol documents.

This repo is built as an AI Engineer interview artifact: clean ingestion, citation-ready chunks, OpenAI embeddings, Qdrant vector DB storage, retrieval, prompt construction, and LLM answers with sources.

For the system-level design, see [`architecture.md`](architecture.md).

## Protocol Knowledge Agent

The repo includes a single-agent layer on top of the RAG pipeline:

```txt
question
-> LLM selects tool_call or final_answer
-> validate tool input
-> execute retrieve_protocol_context
-> append observation and numbered evidence
-> repeat until final answer or max turns
-> validate citations and missing-context guardrails
-> missing docs + next actions
```

This is more realistic than a one-shot API call. The model chooses when to call a registered tool, while the runtime owns validation, execution, observations, turn limits, citation checks, and missing-context guardrails.

## Current pipeline

```txt
Protocol Docs
-> Loader
-> Chunker
-> Content Hash + Index Metadata
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
all docs -> chunks -> content hashes + index metadata -> document registry plan -> stale deletion + embeddings -> Qdrant

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
- SHA-256 `contentHash` and `chunkHash` metadata for indexed chunks
- `embeddingModel`, `embeddingDimension`, `indexVersion`, and `indexedAt` metadata on upserted vectors
- Postgres-backed document registry for unchanged-document skip logic
- Stale chunk deletion for changed documents whose chunk IDs disappear
- Production OpenAI-compatible embeddings client
- Qdrant vector database store
- Tenant/site metadata filters for multi-corpus website chatbots
- In-memory vector store kept for tests/simple demos
- Retriever that embeds the user query and returns top-k matching chunks
- Prompt builder that combines retrieved context with user input
- Production OpenAI-compatible chat client
- End-to-end RAG answer orchestration
- Zod-validated structured LLM answers with confidence, citations, and missing-context flags
- HTTP API with `POST /ask`, `POST /agent/ask`, `GET /healthz`, and `GET /readyz`
- Structured RAG tracing/logging with request IDs, retrieval metadata, stage timings, and error events
- JSON logger with log levels, timestamps, and secret-field redaction
- RAG eval runner for retrieval quality and grounded answer checks
- Judge-based RAG eval scoring for faithfulness, relevance, citation correctness, and rationale
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
- Postgres document registry
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

Index version:

```bash
INDEX_VERSION=local-protocol-v1
```

If `INDEX_VERSION` is unset, ingest generates a timestamp-based value. Each indexed chunk stores the index version so traces and API sources can be tied back to the exact corpus/index build that served an answer.

Document registry store:

```bash
DOCUMENT_REGISTRY_STORE=postgres
```

Production ingest uses Postgres for the document registry. `DOCUMENT_REGISTRY_STORE=postgres` requires `DATABASE_URL` and stores registry rows in `rag_documents`. For local-only demos, `DOCUMENT_REGISTRY_STORE=file` writes `.rag/document-registry.json`; `.rag/` is ignored by git because it is runtime state.

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
export INDEX_VERSION=local-protocol-v1
export DOCUMENT_REGISTRY_STORE=postgres
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
  "upsertedChunks": 32,
  "deletedStaleChunks": 0,
  "skippedDocuments": 0,
  "registryStore": "postgres",
  "store": "qdrant",
  "embeddingModel": "text-embedding-3-small",
  "embeddingDimension": 1536,
  "indexVersion": "local-protocol-v1",
  "indexedAt": "2026-05-16T00:00:00.000Z"
}
```

Ask a full RAG question using Qdrant + LLM answer generation:

```bash
bun run ask "what are the protocol maintenance margin ratio, fees, and leverage limits?" 3
```

The final argument is `topK`. For example, `3` means retrieve the top 3 most relevant chunks from Qdrant and pass those chunks to the LLM as context.

The LLM is instructed to return only valid JSON. The app validates that JSON with Zod before trusting it, so malformed model output fails fast instead of leaking into downstream API responses.

Run the protocol knowledge agent:

```bash
bun run agent "How do liquidation agents stay safe?" 4 3
```

The second argument is the default `topK` for retrieval tool calls. The third argument is `maxTurns`.

Run the HTTP API:

```bash
bun run serve
```

Health check:

```bash
curl http://localhost:3000/healthz | jq
```

Readiness check:

```bash
curl http://localhost:3000/readyz | jq
```

`/healthz` only confirms the HTTP process is alive. `/readyz` confirms the production dependencies are usable before traffic should be sent to the service:

- required env vars: `OPENAI_API_KEY`, `QDRANT_URL`, `QDRANT_COLLECTION`, `DATABASE_URL`
- Qdrant collection exists and is reachable
- Postgres is reachable
- `rag_documents` table exists
- embedding/chat model config is valid

If any dependency fails, `/readyz` returns HTTP 503 with per-check details.

Ask through the API:

```bash
curl -s \
  -X POST http://localhost:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"what are the protocol maintenance margin ratio, fees, and leverage limits?","topK":3}' | jq
```

Ask through the tool-using chatbot agent:

```bash
curl -s \
  -X POST http://localhost:3000/agent/ask \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"personal","siteId":"bhargav-portfolio","question":"what did Bhargav build at Nunchi?","topK":4,"maxTurns":6}' | jq
```

`/agent/ask` uses the same indexed corpus and vector store, but routes the request through the protocol knowledge agent. The agent can call retrieval tools, validate tool inputs, enforce turn limits, and return grounded answers with citations. Browser CORS is enabled so a static portfolio site can call this endpoint without exposing OpenAI or Qdrant credentials.

For website chatbot deployments, pass `tenantId` and `siteId` so retrieval is filtered to the correct corpus. The same Qdrant collection and Postgres database can hold multiple customers or websites as long as every ingest and query carries the correct scope.

Ingest the personal portfolio corpus:

```bash
TENANT_ID=personal SITE_ID=bhargav-portfolio bun run ingest data/docs/portfolio
```

When the server should default to the portfolio corpus for requests that do not include explicit scope:

```bash
DEFAULT_TENANT_ID=personal DEFAULT_SITE_ID=bhargav-portfolio bun run serve
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
      "score": 0.5373063,
      "indexVersion": "local-protocol-v1",
      "chunkHash": "..."
    },
    {
      "sourcePath": "protocol/configuration.md",
      "chunkId": "protocol/configuration.md#section-fee-parameters-chunk-0",
      "score": 0.5180107,
      "indexVersion": "local-protocol-v1",
      "chunkHash": "..."
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
      "score": 0.5373063,
      "contentHash": "...",
      "chunkHash": "...",
      "embeddingModel": "text-embedding-3-small",
      "embeddingDimension": 1536,
      "indexVersion": "local-protocol-v1",
      "indexedAt": "2026-05-16T00:00:00.000Z"
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

The trace is intentionally operational: request ID, question, `topK`, chat model, retrieved source chunks, optional heading paths, similarity scores, content/chunk hashes, embedding/index metadata, per-stage latency, and errors. The logger redacts obvious secret fields before writing JSON lines, so API keys and vector database credentials are not logged.

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
    "total": 5,
    "passed": 5,
    "failed": 0
  }
}
```

Run judge-based RAG evals:

```bash
bun run eval:judge evals/questions.json 3
```

The judge eval command first runs the deterministic eval path, then sends each question, retrieved context, generated answer, and reference answer to a judge model. The judge returns structured JSON with:

- `faithfulness`: whether the answer stays inside retrieved context
- `relevance`: whether the answer directly addresses the question
- `citationCorrectness`: whether cited context supports the answer
- `passed`: true only when all judge scores are strong enough
- `rationale`: concise explanation for debugging

Use deterministic evals as the small fast smoke suite. Use judge evals when you want semantic quality scoring without hand-writing exact wording for every acceptable answer. Keep adding eval cases from real user-flagged wrong answers.

Optional judge model override:

```bash
export JUDGE_MODEL=gpt-5.5
```

Example judge summary:

```json
{
  "summary": {
    "total": 5,
    "passed": 5,
    "failed": 0,
    "averages": {
      "faithfulness": 0.92,
      "relevance": 0.9,
      "citationCorrectness": 0.96
    }
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
    "count": 32
  },
  "status": "ok"
}
```

View stored records without large vectors. Payloads include source metadata plus production index fields such as `contentHash`, `chunkHash`, `embeddingModel`, `embeddingDimension`, `indexVersion`, and `indexedAt`:

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

Re-running ingest is idempotent for the same docs because the document registry skips unchanged documents and chunks are upserted by stable chunk IDs. After the first ingest, unchanged docs should report `skippedDocuments` and avoid re-embedding. If a document changes and produces fewer/different chunk IDs, stale chunk IDs from the previous registry record are deleted from the vector store before the new chunks are upserted.

## Current production indexing metadata

`bun run ingest data/docs` now annotates every chunk before embedding/upsert:

```txt
contentHash      SHA-256 of full source document text
chunkHash        SHA-256 of exact chunk text
embeddingModel   embedding model used for the vector
embeddingDimension vector dimension expected by the store
indexVersion     INDEX_VERSION or a generated timestamp version
indexedAt        ingest timestamp
```

This metadata feeds the document registry. On each ingest, the registry compares current chunks with previous records and:

1. skips unchanged documents with the same `contentHash`, `embeddingModel`, and `embeddingDimension`
2. re-embeds changed documents
3. deletes stale chunk IDs that existed in the prior registry record but no longer exist after re-chunking
4. writes the next registry state to Postgres `rag_documents` when `DOCUMENT_REGISTRY_STORE=postgres`; `DOCUMENT_REGISTRY_STORE=file` remains available for local-only demos

Use Postgres for the production document registry even when vectors live in Qdrant:

```bash
export DATABASE_URL=postgres://rag:***@localhost:5432/rag
export DOCUMENT_REGISTRY_STORE=postgres
bun run db:schema
```

For local-only demos without Postgres, set `DOCUMENT_REGISTRY_STORE=file`, but production deploys should use Postgres so registry state is shared, persistent, and queryable.

## Hosted Railway deployment

The production-style Railway deployment uses three services in the same Railway project:

- API service: runs this repo with `bun run serve`
- Qdrant service: stores vectors and chunk payloads
- Postgres service: stores the `rag_documents` document registry

Required API env vars on Railway:

```bash
OPENAI_API_KEY=***
OPENAI_BASE_URL=https://api.openai.com/v1
CHAT_MODEL=gpt-5.5
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536
INDEX_VERSION=railway-protocol-v1
VECTOR_STORE=qdrant
QDRANT_URL=https://<qdrant-railway-domain>
QDRANT_COLLECTION=protocol_docs
QDRANT_API_KEY=***
DATABASE_URL=postgres://...
DOCUMENT_REGISTRY_STORE=postgres
```

Before serving traffic, run the schema migration and ingest once against the production services. Use the TypeScript schema runner in Railway containers because it only needs the app's existing `postgres` package and does not require a `psql` binary:

```bash
bun run db:schema:ts
bun run ingest data/docs
```

For a combined one-shot bootstrap command:

```bash
bun run bootstrap
```

Then verify readiness:

```bash
curl https://<api-railway-domain>/readyz | jq
```

`/readyz` should return HTTP 200 before the API is considered live. If it returns 503, inspect the failed check and fix the missing env var, Qdrant collection, or Postgres schema before using `/ask` or `/agent/ask`.

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

## Interview framing

I built a perps/blockchain RAG pipeline from first principles. The system loads protocol docs, chunks Markdown by section with citation metadata, attaches content hashes and index metadata, uses a Postgres document registry to skip unchanged docs and delete stale chunk IDs, creates production OpenAI embeddings, stores vectors in Qdrant, retrieves top-k context with cosine similarity for user questions, builds a grounded prompt, validates structured LLM JSON with Zod, and returns an answer with sources. The design keeps each stage testable and production-focused: ingestion, chunking, embedding provider, Qdrant vector store, Postgres registry, retriever, prompt builder, LLM client, and HTTP API are separated. The repo includes deterministic RAG regression evals, judge-based semantic scoring for faithfulness/relevance/citations, plus Ragas-compatible JSONL export for external semantic evaluation workflows.

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

RAG evals include this protocol-specific config case and can also be judged semantically:

```bash
bun run eval evals/questions.json 3
bun run eval:judge evals/questions.json 3
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

1. Deploy the HTTP API on Railway with managed Postgres wired to Qdrant.
2. Add `/feedback` endpoint so user-flagged wrong answers can become eval cases.
3. Add CI workflow for tests and typecheck.
4. Persist eval/feedback runs in Postgres.
5. Add streaming answers.
