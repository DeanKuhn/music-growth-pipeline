select
    id as similarity_id,
    artist_id,
    similar_artist_id,
    similar_name,
    similar_mbid,
    similarity_score,
    fetched_at
from {{ source('public', 'artist_similarities') }}