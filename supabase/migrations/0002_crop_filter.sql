-- Adds an optional crop filter to match_crop_knowledge.
-- crops = null searches everything; e.g. {paddy,general} limits to paddy + general advice.
-- Safe to run more than once.

create index if not exists crop_knowledge_crop_idx
  on crop_knowledge ((metadata->>'crop'));

drop function if exists match_crop_knowledge(vector, double precision, integer);
drop function if exists match_crop_knowledge(vector, double precision, integer, text[]);

create function match_crop_knowledge (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  crops text[] default null
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
  where (crops is null or crop_knowledge.metadata->>'crop' = any(crops))
    and 1 - (crop_knowledge.embedding <=> query_embedding) > match_threshold
  order by crop_knowledge.embedding <=> query_embedding
  limit match_count;
$$;
