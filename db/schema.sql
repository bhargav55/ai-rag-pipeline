create extension if not exists vector;

create table if not exists rag_chunks (
  id text primary key,
  source_path text not null,
  domain text not null,
  chunk_index integer not null,
  text text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rag_chunks_embedding_hnsw_idx
  on rag_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists rag_chunks_source_path_idx on rag_chunks (source_path);
create index if not exists rag_chunks_domain_idx on rag_chunks (domain);
