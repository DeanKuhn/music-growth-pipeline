import json
import os
import psycopg2 # type:ignore
from datetime import date
from dotenv import load_dotenv #type:ignore
import re

load_dotenv()

_pattern_str = os.getenv('PROFANITY_PATTERN', '')
PROFANITY_PATTERN = re.compile(r'(' + _pattern_str + r')', re.IGNORECASE) \
    if _pattern_str else None

SERIES_START_DATE = '2026-05-10'

def sanitize_name(name):
    if PROFANITY_PATTERN and PROFANITY_PATTERN.search(name):
        return '[redacted]'
    return name

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()

stats = {}
stats['generated_at'] = date.today().isoformat()

# --- SUMMARY ---
cur.execute("""
    select count(*), max(weeks_tracked) from artist_growth_summary
""")
row = cur.fetchone()
stats['summary'] = {
    'artist_count': row[0], # type:ignore
    'weeks_tracked': row[1] # type:ignore
}

cur.execute("""
    select max(snapshot_date) from artist_snapshots
""")
row = cur.fetchone()
stats['summary']['latest_snapshot'] = row[0] # type:ignore

# --- GROWTH BY SIZE QUINTILE ---
query = """
    with bounded as (
        select artist_id, listeners, snapshot_date
        from stg_artist_snapshots
        where snapshot_date >= %s
    ),

    agg as (
        select
            artist_id,
            (array_agg(listeners order by snapshot_date asc ))[1]
                as starting_listeners,
            (array_agg(listeners order by snapshot_date desc))[1]
                as latest_listeners
        from bounded
        group by artist_id
    ),

    growth as (
        select
            starting_listeners,
            100.0 * (latest_listeners - starting_listeners) / starting_listeners
                as total_pct_growth,
            ntile(5) over (order by starting_listeners) as listener_quintile
        from agg
        where starting_listeners > 0
    )

    select
        listener_quintile,
        count(*) as artists,
        min(starting_listeners) as band_min,
        max(starting_listeners) as band_max,

        round(avg(total_pct_growth), 2) as avg_pct_growth,

        round(
            percentile_cont(0.5)
                within group (order by total_pct_growth)::numeric, 2
        ) as median_pct_growth,

        round(
            percentile_cont(0.9)
                within group (order by total_pct_growth)::numeric, 2
        ) as p90_pct_growth

    from growth
    group by listener_quintile
    order by listener_quintile
"""
cur.execute(query, (SERIES_START_DATE,))

rows = cur.fetchall()
stats['growth_by_size_quintile'] = [
    {
        'quintile': int(row[0]),
        'artist_count': int(row[1]),
        'band_min': int(row[2]),
        'band_max': int(row[3]),
        'avg_pct_growth': float(row[4]),
        'median_pct_growth': float(row[5]),
        'p90_pct_growth': float(row[6])
    }
    for row in rows
]

# --- TOP 10 FASTEST GROWING ARTISTS ---
cur.execute("""
    select
        artist_name,
        starting_count,
        ending_count,
        total_pct_growth
    from artist_growth_summary
    where size_band_sort <= 4
        and weeks_tracked >= 6
        and starting_count > 5000
    order by total_pct_growth desc
    limit 10
""")
rows = cur.fetchall()
stats['top_growing_artists'] = [
    {
        'artist_name': sanitize_name(row[0]),
        'starting_count': row[1],
        'ending_count': row[2],
        'total_pct_growth': float(row[3])
    }
    for row in rows
]

# --- GENRE GROWTH ---
cur.execute("""
    select
        genre,
        artist_count,
        median_total_pct_growth
    from genre_growth
    order by median_total_pct_growth desc
    limit 5
""")
rows = cur.fetchall()
stats['genre_growth'] = [
    {
        'genre': row[0],
        'artist_count': row[1],
        'median_total_pct_growth': float(row[2])
    }
    for row in rows
]

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
output_path = os.path.join(REPO_ROOT, 'data', 'pipeline_stats.json')

os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(output_path, 'w') as f:
    json.dump(stats, f, indent=2, default=str, ensure_ascii=False)

print(f"Written to {output_path}")
cur.close()
conn.close()