import json
import os
import psycopg2 # type:ignore
from datetime import date
from dotenv import load_dotenv #type:ignore
import re

load_dotenv()

_pattern_str = os.getenv('PROFANITY_PATTERN', '')
PROFANITY_PATTERN = re.compile(r'(' + _pattern_str + r')', re.IGNORECASE) if _pattern_str else None

def sanitize_name(name):
    if PROFANITY_PATTERN and PROFANITY_PATTERN.search(name):
        return '[redacted]'
    return name

conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()

stats = {}

# Get the current date
stats['generated_at'] = date.today().isoformat()

# --- SUMMARY ---
cur.execute("""
    select count(*), max(weeks_tracked) from artist_growth_summary
""")
row = cur.fetchone()
stats['summary'] = {
    'artist_count': row[0],
    'weeks_tracked': row[1]
}

cur.execute("""
    select max(snapshot_date) from artist_snapshots
""")
row = cur.fetchone()
stats['summary']['latest_snapshot'] = row[0]

# --- GROWTH BY TIER ---
cur.execute("""
    select
        tier,
        count(*) as artist_count,
        round(avg(total_pct_growth), 2) as avg_pct_growth,
        round(
            percentile_cont(0.5) within group (order by total_pct_growth)::numeric, 2
        ) as median_pct_growth,
        round(
            percentile_cont(0.9) within group (order by total_pct_growth)::numeric, 2
        ) as p90_pct_growth
    from artist_growth_summary
    where weeks_tracked >= 6
    group by tier
    order by tier
""")
rows = cur.fetchall()
stats['growth_by_tier'] = [
    {
        'tier': row[0],
        'artist_count': row[1],
        'median_pct_growth': float(row[3]),
        'p90_pct_growth': float(row[4])
    }
    for row in rows
]

# --- TOP 10 FASTEST GROWING ARTISTS ---
cur.execute("""
    select
        artist_name,
        min_page,
        starting_count,
        ending_count,
        total_pct_growth
    from artist_growth_summary
    where tier = 'indie'
        and weeks_tracked >= 6
        and starting_count > 5000
    order by total_pct_growth desc
    limit 10
""")
rows = cur.fetchall()
stats['top_growing_artists'] = [
    {
        'artist_name': sanitize_name(row[0]),
        'min_page': row[1],
        'starting_count': row[2],
        'ending_count': row[3],
        'total_pct_growth': float(row[4])
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

output_path = os.path.join(os.path.dirname(__file__),
                           'data', 'pipeline_stats.json')

os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(output_path, 'w') as f:
    json.dump(stats, f, indent=2, default=str, ensure_ascii=False)

print(f"Written to {output_path}")
cur.close()
conn.close()