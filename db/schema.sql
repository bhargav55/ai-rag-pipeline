create extension if not exists vector;

create table if not exists rag_chunks (
  id text primary key,
  source_path text not null,
  domain text not null,
  chunk_index integer not null,
  text text not null,
  heading_path jsonb not null default '[]'::jsonb,
  content_hash text,
  chunk_hash text,
  embedding_model text,
  embedding_dimension integer,
  index_version text,
  indexed_at timestamptz,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table rag_chunks add column if not exists heading_path jsonb not null default '[]'::jsonb;
alter table rag_chunks add column if not exists content_hash text;
alter table rag_chunks add column if not exists chunk_hash text;
alter table rag_chunks add column if not exists embedding_model text;
alter table rag_chunks add column if not exists embedding_dimension integer;
alter table rag_chunks add column if not exists index_version text;
alter table rag_chunks add column if not exists indexed_at timestamptz;

create index if not exists rag_chunks_embedding_hnsw_idx
  on rag_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists rag_chunks_source_path_idx on rag_chunks (source_path);
create index if not exists rag_chunks_domain_idx on rag_chunks (domain);
create index if not exists rag_chunks_content_hash_idx on rag_chunks (content_hash);
create index if not exists rag_chunks_index_version_idx on rag_chunks (index_version);

create table if not exists rag_documents (
  source_path text primary key,
  content_hash text not null,
  chunk_ids jsonb not null,
  embedding_model text not null,
  embedding_dimension integer not null,
  index_version text not null,
  indexed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rag_documents_content_hash_idx on rag_documents (content_hash);
create index if not exists rag_documents_index_version_idx on rag_documents (index_version);

