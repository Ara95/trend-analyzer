-- Semantic hybrid search over the video index (engine step 2b). Lexical FTS (step 1) already works via
-- the caption_tsv GIN index; this adds the vector half and a Reciprocal Rank Fusion RPC that blends the
-- two. The web embeds the user's query at search time and calls search_videos(); browse (no query)
-- stays a plain ordered select and does not touch this function.

-- Approximate-nearest-neighbour index for cosine distance (<=>). Rows with a null embedding are simply
-- absent from the index (and from the vector ranker) until `npm run embed:videos` fills them.
create index if not exists videos_embedding_hnsw
  on videos using hnsw (embedding vector_cosine_ops);

-- Hybrid retrieval with Reciprocal Rank Fusion. q_embedding arrives as TEXT ('[0.1,0.2,…]') and is cast
-- to vector here — PostgREST casts text→vector reliably, a JSON array would not. Either ranker may be
-- empty (no query text, or no embedding/unembedded rows); a row scores if it appears in at least one.
-- k = 60 is the standard RRF constant. Final tiebreak: trend_score then views, so equally-relevant
-- results still lead with the breakouts.
create or replace function search_videos(
  q text default null,
  q_embedding text default null,
  filter_platform text default null,
  filter_language text default null,
  since timestamptz default null,
  max_results int default 60
)
returns setof videos
language sql
stable
as $$
  with base as (
    select v.*
    from videos v
    where (filter_platform is null or v.platform = filter_platform)
      and (filter_language is null or v.language = filter_language)
      and (since is null or v.posted_at >= since)
  ),
  fts as (
    select id,
      row_number() over (
        order by ts_rank(caption_tsv, websearch_to_tsquery('simple', q)) desc
      ) as rnk
    from base
    where q is not null and q <> ''
      and caption_tsv @@ websearch_to_tsquery('simple', q)
  ),
  vec as (
    select id,
      row_number() over (order by embedding <=> q_embedding::vector(1536)) as rnk
    from base
    where q_embedding is not null and embedding is not null
  ),
  fused as (
    select b.id,
      coalesce(1.0 / (60 + fts.rnk), 0) + coalesce(1.0 / (60 + vec.rnk), 0) as rrf
    from base b
    left join fts on fts.id = b.id
    left join vec on vec.id = b.id
    where fts.id is not null or vec.id is not null
  )
  select b.*
  from base b
  join fused on fused.id = b.id
  order by fused.rrf desc, b.trend_score desc nulls last, b.views desc
  limit max_results;
$$;

-- The engine/web read with the service-role key; make sure it can call the function (recent Supabase
-- does not auto-grant new objects to the API roles — see 0003_grants.sql).
grant execute on function search_videos(text, text, text, text, timestamptz, int) to service_role;
