-- Enable pgvector extension
create extension if not exists vector;

-- Table to store ANGRAU/ICAR crop guides
create table crop_knowledge (
  id uuid primary key default gen_random_uuid(),
  content text not null,          -- Paragraph / guide text
  metadata jsonb,                 -- { crop: "Paddy", disease: "Blast", source: "ANGRAU 2024" }
  embedding vector(768)           -- Gemini / OpenAI text embedding vector
);

-- Speeds up cosine-similarity search as the corpus grows past a trivial size.
-- Without this, match_crop_knowledge does a full sequential scan.
create index on crop_knowledge using hnsw (embedding vector_cosine_ops);

-- Match function for vector search
create or replace function match_crop_knowledge (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    crop_knowledge.id,
    crop_knowledge.content,
    crop_knowledge.metadata,
    1 - (crop_knowledge.embedding <=> query_embedding) as similarity
  from crop_knowledge
  where 1 - (crop_knowledge.embedding <=> query_embedding) > match_threshold
  order by crop_knowledge.embedding <=> query_embedding
  limit match_count;
$$;
