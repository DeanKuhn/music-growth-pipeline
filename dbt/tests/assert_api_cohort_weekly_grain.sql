-- The membership CTE unions three cohort definitions together; if two of them
-- ever emit the same (cohort_type, cohort_key) an artist would be counted
-- twice and the median would silently shift. Fail the build instead.

select
    cohort_type,
    cohort_key,
    snapshot_date,
    count(*) as row_count
from {{ ref('api_cohort_weekly') }}
group by cohort_type, cohort_key, snapshot_date
having count(*) > 1
