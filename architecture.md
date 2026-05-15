# Architecture

This project is a production-style TypeScript/Bun RAG pipeline for protocol documentation. The design separates offline indexing from online answering so each stage can be tested, replaced, and observed independently.

## Offline ingest path

```txt
source docs
-> recursive loader
-> section-aware chunker
-> index metadata annotator
-> OpenAI-compatible embedding client
-> vector store upsert
```

The ingest path loads `.md` and `.txt` files from `data/docs`, splits Markdown by heading sections, falls back to overlapping fixed-size chunks when needed, embeds each chunk, and writes vectors plus payload metadata to Qdrant or pgvector.

Each indexed chunk now carries production debugging metadata:

- `contentHash`: SHA-256 hash of the full source document text
- `chunkHash`: SHA-256 hash of the exact chunk text embedded
- `embeddingModel`: model used to generate the vector
- `embeddingDimension`: vector size expected by the collection
- `indexVersion`: deployment/build label for this index run
- `indexedAt`: timestamp for when this chunk was prepared for upsert
- `headingPath`: Markdown section breadcrumb when available
- `sourcePath`, `domain`, `chunkIndex`, `chunkId`

This metadata makes index contents auditable and is the foundation for incremental ingestion, stale chunk deletion, and shadow index comparison.

## Online ask path

```txt
user question
-> question embedding
-> vector search
-> top-k retrieved chunks
-> grounded prompt
-> OpenAI-compatible chat model
-> Zod structured answer validation
-> answer + sources + traceId
-> structured JSON trace log
```

Qdrant/pgvector only retrieve source chunks. The LLM writes the final answer using those chunks. The answer includes sources so the response can be audited.

## Vector stores

Qdrant is the default production-style vector database. pgvector remains as a Postgres-backed alternative, and an in-memory vector store is used for tests and simple local demos.

Qdrant stores the vector and payload metadata together. pgvector stores metadata in explicit columns on `rag_chunks`.

## Observability

Every CLI/API RAG answer can emit a structured JSON trace. Trace events include:

- `requestId` / API `traceId`
- question and top-k
- chat model
- retrieved chunk IDs, source paths, headings, scores
- chunk/index metadata such as `chunkHash`, `contentHash`, `embeddingModel`, and `indexVersion`
- per-stage timings for embedding, vector search, prompt build, LLM, validation, and total latency
- error name/message for failed calls

The shared JSON logger adds timestamp, level, and message fields and redacts obvious secret fields.

## Evaluation loop

The repo uses two eval layers:

1. Deterministic smoke evals: small curated cases that check expected sources and required factual terms.
2. Judge-based evals: semantic scoring for faithfulness, relevance, citation correctness, pass/fail, and rationale.

The intended production loop is to keep the curated set small, then grow it from user-flagged wrong answers, low judge scores, and high-risk protocol changes.

## Configuration and source of truth

The seed corpus includes `data/docs/protocol/configuration.md`, which defines protocol-specific values such as maintenance margin ratio, maker/taker fees, liquidator fee, and leverage limits. These values are intentionally stored in the corpus so answers can be grounded in source-of-truth docs instead of generic model knowledge.

## Current production-hardening status

Implemented:

- section-aware chunking
- source/citation metadata
- Qdrant and pgvector stores
- structured answer validation
- HTTP API
- structured trace logging
- deterministic evals
- judge-based evals
- content hashes and index metadata on chunks

Still missing:

- document registry for tracking which docs/chunks are indexed
- stale chunk deletion when a document shrinks or changes chunk boundaries
- unchanged-document skip logic to avoid unnecessary re-embedding
- `/feedback` endpoint for user-flagged wrong answers
- `/readyz` endpoint that checks vector store and model readiness
- shadow/candidate index comparison before embedding/chunking upgrades
- Railway deployment config for the API service

## Stale chunk deletion plan

Content hashes and chunk hashes are the first step. The next production step is a document registry that records `sourcePath`, `contentHash`, `chunkIds`, `embeddingModel`, `embeddingDimension`, `indexVersion`, and `indexedAt` for every ingest. With that registry, ingest can:

1. Skip unchanged documents.
2. Re-embed changed documents.
3. Delete old chunk IDs that no longer exist after re-chunking.
4. Attribute every answer to the exact index version that served it.
