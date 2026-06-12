-- Perceptual-hash duplicate lookup (64-bit dHash, Hamming distance via bit_count).
-- Threshold 6/64 ≈ 9% bit difference ≈ "within ~5% visual similarity" flag zone.
create or replace function find_similar_photo(p_hash text, p_threshold int default 6)
returns table(photo_id uuid, distance int)
language sql stable security definer set search_path = public as $$
  select id as photo_id, bit_count(phash # p_hash::bit(64))::int as distance
  from photos
  where phash is not null
    and status in ('available','assigned','delivered','flagged')
  group by id, phash
  having bit_count(phash # p_hash::bit(64)) <= p_threshold
  order by distance asc
  limit 1;
$$;
