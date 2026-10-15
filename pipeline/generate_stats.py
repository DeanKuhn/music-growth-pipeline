"""Generate stats for weekly cron run that will populate port site fields.

Tracks fastest growing artists and genres."""

import json
import os
import re
from datetime import date

import psycopg2
from dotenv import load_dotenv

load_dotenv()

_pattern_str = os.getenv("PROFANITY_PATTERN", "")
PROFANITY_PATTERN = (
    re.compile(r"(" + _pattern_str + r")", re.IGNORECASE) if _pattern_str else None
)


def sanitize_name(name):
    if PROFANITY_PATTERN and PROFANITY_PATTERN.search(name):
        return "[redacted]"
    return name


conn = psycopg2.connect(os.getenv("DATABASE_URL"))
cur = conn.cursor()

stats = {}
stats["generated_at"] = date.today().isoformat()

# --- SUMMARY ---
cur.execute("select artists_total, weeks_in_series, latest_snapshot_date from api_pipeline_health")
row = cur.fetchone()
stats["summary"] = {
    "artist_count": row[0],
    "weeks_tracked": row[1],
    "latest_snapshot": row[2],
}

# --- GROWTH BY SIZE QUINTILE ---
query = """
    select
        size_quintile,
        artist_count,
        band_min,
        band_max,
        avg_pct_growth,
        median_pct_growth,
        p90_pct_growth,
        window_start,
        window_end
    from api_growth_by_quintile
    order by size_quintile
"""
cur.execute(query)

rows = cur.fetchall()
stats["growth_by_size_quintile"] = [
    {
        "quintile": int(row[0]),
        "artist_count": int(row[1]),
        "band_min": int(row[2]),
        "band_max": int(row[3]),
        "avg_pct_growth": float(row[4]),
        "median_pct_growth": float(row[5]),
        "p90_pct_growth": float(row[6]),
        "window_start": (row[7]),
        "window_end": (row[8]),
    }
    for row in rows
]

# --- TOP 10 FASTEST GROWING ARTISTS ---
cur.execute("""
    select
        b.artist_name,
        p.start_listeners,
        p.end_listeners,
        p.pct_growth
    from artist_growth_panel p
    join int_artist_base b using (artist_id)
    where b.size_band_sort <= 4 and p.start_listeners > 5000
    order by p.pct_growth desc limit 10
""")
rows = cur.fetchall()
stats["top_growing_artists"] = [
    {
        "artist_name": sanitize_name(row[0]),
        "starting_count": row[1],
        "ending_count": row[2],
        "total_pct_growth": float(row[3]),
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
stats["genre_growth"] = [
    {"genre": row[0], "artist_count": row[1], "median_total_pct_growth": float(row[2])}
    for row in rows
]

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
output_path = os.path.join(REPO_ROOT, "data", "pipeline_stats.json")

os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(output_path, "w") as f:
    json.dump(stats, f, indent=2, default=str, ensure_ascii=False)

print(f"Written to {output_path}")
cur.close()
conn.close()

