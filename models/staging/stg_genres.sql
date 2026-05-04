select
    id as genre_id,
    genre,
    fetched_at
from {{ source('public', 'genres') }}