# AI RAG Pipeline

A TypeScript/Bun RAG foundation for perps and blockchain protocol documents.

This repo is built as an AI Engineer interview artifact: clean ingestion, metadata, citation-ready chunks, tests, and CLI verification before adding embeddings or LLM calls.

## Current scope

Current pipeline:

```txt
Protocol Docs -> Loader -> Chunker -> OpenAI Embeddings -> Vector Store -> Retriever -> Retrieved Context with Sources
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
- Production OpenAI-compatible embeddings client
- In-memory vector store using cosine similarity
- Retriever that embeds the user query and returns top-k matching chunks
- Seed perps/risk docs
- Vitest tests
- CLI loader demo
- CLI retriever demo

Not yet added:

- Persistent vector DB
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

Retrieve production context using OpenAI embeddings:

```bash
export OPENAI_API_KEY=your_api_key
bun run retrieve data/docs "what happens when margin falls below maintenance?" 2
```

Optional embedding config:

```bash
export EMBEDDING_MODEL=text-embedding-3-small
export OPENAI_BASE_URL=https://api.openai.com/v1
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

I built a perps/blockchain RAG pipeline from first principles. The system loads protocol docs, chunks them with citation metadata, creates production OpenAI embeddings, stores vectors, and retrieves top-k context for user questions. The design keeps each stage testable and swappable: ingestion, chunking, embedding provider, vector store, and retriever are separated so the next production step can replace the in-memory store with pgvector/Pinecone/Qdrant without changing the rest of the pipeline.

## Next milestones

1. Add persistent vector storage with pgvector, Qdrant, or Pinecone.
2. Add RAG answer generation with citations.
3. Add eval cases for funding, margin, liquidation, and oracle risk questions.
4. Add ingestion cache so unchanged docs are not re-embedded.
5. Add tracing/logging for retrieval scores and selected sources.
