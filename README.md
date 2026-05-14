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
- Seed perps/risk docs
- Vitest tests
- CLI tools for load, retrieve, ingest, and ask

## Stack

- TypeScript
- Bun
- Vitest
- Zod
- Qdrant vector database
- Optional Postgres + pgvector backend
- OpenAI-compatible embeddings/chat APIs

## Setup

Install dependencies:

```bash
bun install
```

Start local Qdrant vector DB:

```bash
docker compose up -d qdrant
```

Set vector DB config:

```bash
export VECTOR_STORE=qdrant
export QDRANT_URL=http://localhost:6333
export QDRANT_COLLECTION=protocol_docs
export EMBEDDING_DIMENSION=1536
```

Set OpenAI-compatible API config:

```bash
export OPENAI_API_KEY=***
export OPENAI_BASE_URL=https://api.openai.com/v1
export EMBEDDING_MODEL=text-embedding-3-small
export CHAT_MODEL=gpt-5.5
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

One-shot retrieval without vector DB persistence:

```bash
bun run retrieve data/docs "what happens when margin falls below maintenance?" 2
```

Ingest docs into Qdrant:

```bash
bun run ingest data/docs
```

Ask a full RAG question using Qdrant + LLM answer generation:

```bash
bun run ask "what happens when margin falls below maintenance?" 3
```

Example answer shape:

```json
{
  "store": "qdrant",
  "answer": "Liquidation happens when account equity falls below maintenance margin [1].",
  "sources": [
    {
      "sourcePath": "risk/liquidation.md",
      "chunkId": "risk/liquidation.md#chunk-0",
      "score": 0.91
    }
  ]
}
```

## Hosted Qdrant on Railway

A Railway-hosted Qdrant service is available for production-style demos:

- Railway project: `ai-rag-qdrant`
- Railway service: `qdrant`
- Public URL: `https://qdrant-production-b4b4.up.railway.app`
- Persistent volume mount: `/qdrant/storage`
- Qdrant API key is configured on Railway as `QDRANT__SERVICE__API_KEY`

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

I built a perps/blockchain RAG pipeline from first principles. The system loads protocol docs, chunks them with citation metadata, creates production OpenAI embeddings, stores vectors in Qdrant, retrieves top-k context for user questions, builds a grounded prompt, and generates an answer with sources. The design keeps each stage testable and swappable: ingestion, chunking, embedding provider, vector store, retriever, prompt builder, and LLM client are separated. pgvector is also implemented as an alternate backend to show I understand both dedicated vector databases and Postgres-native vector search.

## Next milestones

1. Add ingestion cache so unchanged docs are not re-embedded.
2. Add RAG eval cases for funding, margin, liquidation, and oracle risk questions.
3. Add structured JSON answer validation with Zod.
4. Add tracing/logging for retrieval scores and selected sources.
5. Add CI workflow for tests and typecheck.
