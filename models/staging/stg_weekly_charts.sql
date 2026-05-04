select
    id as chart_id,
    artist_id,
    rank,
    page,
    snapshot_date
from {{ source('public', 'weekly_charts') }}