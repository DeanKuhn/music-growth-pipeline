select
    id as artist_id,
    name as artist_name,
    mbid,
    created_at
from {{ source('public', 'artists') }}