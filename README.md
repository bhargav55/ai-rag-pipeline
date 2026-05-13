# AI RAG Pipeline

A TypeScript/Bun RAG foundation for perps and blockchain protocol documents.

This repo is built as an AI Engineer interview artifact: clean ingestion, metadata, citation-ready chunks, tests, and CLI verification before adding embeddings or LLM calls.

## Current scope

Day 1 pipeline:

```txt
Protocol Docs -> Loader -> Chunker -> Citation Metadata -> CLI Summary
```

Implemented:

- Recursive `.md` / `.txt` document loader
- Unsupported-file filtering
- Stable source ordering
- Metadata for citations:
  - `sourcePath`
  - `extension`
  - `sizeBytes`
  - `domain`
- Fixed-size overlapping chunks
- Seed perps/risk docs
- Vitest tests
- CLI loader demo

Not yet added:

- Embeddings
- Vector DB
- Retriever
- LLM answer generation
- RAG evals

## Stack

- TypeScript
- Bun
- Vitest
- Zod

## Run

Install dependencies:

```bash
bun install
```

Run tests:

```bash
bun test
```

Typecheck:

```bash
bun run typecheck
```

Load seed docs:

```bash
bun run load data/docs
```

Example output:

```json
{
  "docsDir": "data/docs",
  "documents": 4,
  "chunks": 4
}
```

## Interview framing

I built a perps/blockchain RAG pipeline from first principles. The first milestone focuses on document ingestion, metadata, citation readiness, chunking, tests, and a runnable CLI before adding embeddings or an LLM. This keeps the system debuggable: retrieval quality depends on clean documents and stable chunk metadata before model calls enter the loop.

## Next milestones

1. Add deterministic local embedding interface and mock embeddings for tests.
2. Add in-memory vector store.
3. Add retriever with top-k scoring.
4. Add RAG answer format with citations.
5. Add eval cases for funding, margin, liquidation, and oracle risk questions.
