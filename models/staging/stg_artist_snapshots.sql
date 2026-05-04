select
    id as snapshot_id,
    artist_id,
    listeners,
    playcount,
    snapshot_date
from {{ source('public', 'artist_snapshots') }}