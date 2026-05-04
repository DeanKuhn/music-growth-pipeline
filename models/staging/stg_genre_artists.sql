select
    id as genre_artist_id,
    genre_id,
    artist_id,
    rank_in_genre,
    fetched_at
from {{ source('public', 'genre_artists') }}