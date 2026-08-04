-- The API reads this model with a bare `where artist_id = $1 order by
-- snapshot_date`, so a duplicated week would render as a doubled point on the
-- chart rather than an error. Fail the build instead.

select
    artist_id,
    snapshot_date,
    count(*) as row_count
from {{ ref('api_artist_timeseries') }}
group by artist_id, snapshot_date
having count(*) > 1
