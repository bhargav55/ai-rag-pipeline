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
