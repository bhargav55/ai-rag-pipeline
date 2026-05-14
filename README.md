# AI RAG Pipeline

A production-style TypeScript/Bun RAG pipeline for perps and blockchain protocol documents.

This repo is built as an AI Engineer interview artifact: clean ingestion, citation-ready chunks, OpenAI embeddings, pgvector storage, retrieval, prompt construction, and LLM answers with sources.

## Current pipeline

```txt
Protocol Docs
-> Loader
-> Chunker
-> OpenAI Embeddings
-> pgvector
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
- pgvector schema and store
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
- Postgres + pgvector
- OpenAI-compatible embeddings/chat APIs

## Setup

Install dependencies:

```bash
bun install
```

Start local pgvector Postgres:

```bash
docker compose up -d
export DATABASE_URL=postgres://rag:rag@localhost:5432/rag
bun run db:schema
```

Set OpenAI-compatible API config:

```bash
export OPENAI_API_KEY=your_api_key
export OPENAI_BASE_URL=https://api.openai.com/v1
export EMBEDDING_MODEL=text-embedding-3-small
export CHAT_MODEL=gpt-4o-mini
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

One-shot retrieval without pgvector persistence:

```bash
bun run retrieve data/docs "what happens when margin falls below maintenance?" 2
```

Ingest docs into pgvector:

```bash
bun run ingest data/docs
```

Ask a full RAG question using pgvector + LLM answer generation:

```bash
bun run ask "what happens when margin falls below maintenance?" 3
```

Example answer shape:

```json
{
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

## Interview framing

I built a perps/blockchain RAG pipeline from first principles. The system loads protocol docs, chunks them with citation metadata, creates production OpenAI embeddings, stores vectors in pgvector, retrieves top-k context for user questions, builds a grounded prompt, and generates an answer with sources. The design keeps each stage testable and swappable: ingestion, chunking, embedding provider, vector store, retriever, prompt builder, and LLM client are separated.

## Next milestones

1. Add ingestion cache so unchanged docs are not re-embedded.
2. Add RAG eval cases for funding, margin, liquidation, and oracle risk questions.
3. Add structured JSON answer validation with Zod.
4. Add tracing/logging for retrieval scores and selected sources.
5. Add CI workflow for tests and typecheck.
