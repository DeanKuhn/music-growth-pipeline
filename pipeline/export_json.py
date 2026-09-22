"""Connect to postgres and write JSON files for the static site."""

import json
import os

from datetime import date
from decimal import Decimal

from psycopg2.extras import RealDictCursor

from db import get_conn


OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "web", "data")


def serialize(obj):
    if isinstance(obj, date):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Not serializable: {type(obj)}")


def write_json(path, data):
    full = os.path.join(OUTPUT_DIR, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        json.dump(data, f, default=serialize)


def export_all(cur):
    cur.execute("""
        select artist_id, slug, display_name, mbid, size_band, size_band_sort,
               listener_percentile, genres, primary_genre, min_page,
               global_rank, weeks_tracked, series_start_date, series_end_date,
               starting_listeners, latest_listeners, latest_playcount,
               total_listener_delta, total_pct_growth, avg_weekly_pct_change,
               pct_rank_in_size_band, pct_rank_in_genre
        from api_artist_profile
    """)
    profiles = cur.fetchall()

    cur.execute("""
        select artist_id, snapshot_date, week_number,
               listeners, playcount, listener_delta,
               listener_pct_change, listeners_indexed
        from api_artist_timeseries
    """)
    timeseries = cur.fetchall()

    cur.execute("""
        select artist_id, slug, display_name, size_band,
               latest_listeners, total_pct_growth,
               similarity_score, rank
        from api_artist_similar
    """)
    similar = cur.fetchall()

    ts_by_artist = {}
    for row in timeseries:
        ts_by_artist.setdefault(row["artist_id"], []).append(row)

    sim_by_artist = {}
    for row in similar:
        sim_by_artist.setdefault(row["artist_id"], []).append(row)

    for profile in profiles:
        combined = {
            **profile,
            "timeseries": ts_by_artist.get(profile["artist_id"], []),
            "similar": sim_by_artist.get(profile["artist_id"], [])
        }
        write_json(f"artists/{combined['slug']}.json", combined)
    print(f"  artists: {len(profiles)} .json files")

    cur.execute("""
        select slug, display_name, size_band, latest_listeners
        from api_artist_search
        order by latest_listeners desc
    """)
    rows = cur.fetchall()
    write_json("search_index.json", [r for r in rows])
    print(f"  search index: {len(rows)} rows")

    cur.execute("""
        select slice_type, slice_key, rank, metric_value,
               slug, display_name, size_band, primary_genre,
               latest_listeners, total_listener_delta,
               total_pct_growth, weeks_tracked
        from api_leaderboard
        order by slice_type, slice_key, rank
    """)
    rows = cur.fetchall()
    write_json("leaderboards.json", rows)
    print(f"  leaderboard: {len(rows)} rows")

    cur.execute("""
        select genre, artist_count, avg_listeners, avg_plays_per_listener,
               small_count, large_count, avg_total_pct_growth,
               median_total_pct_growth, growth_avg_weekly_pct_change
        from api_genres
        order by artist_count desc
    """)
    rows = cur.fetchall()
    write_json("genres.json", rows)
    print(f"  genres: {len(rows)} rows")

    cur.execute("""
        select cohort_type, cohort_key, snapshot_date, week_number,
               artist_count, p25_indexed, median_indexed,
               p75_indexed, median_pct_change
        from api_cohort_weekly
        order by cohort_type, cohort_key, snapshot_date
    """)
    rows = cur.fetchall()
    write_json("cohort.json", rows)
    print(f"  cohort: {len(rows)} rows")

    cur.execute("""
        select artists_total, artists_with_profile, artists_searchable,
               artists_with_genre, artists_with_similar, genres_total,
               artists_with_history, snapshot_rows, snapshot_dates,
               first_snapshot_date, latest_snapshot_date,
               days_since_snapshot, weeks_in_series, series_start_date,
               built_at
        from api_pipeline_health
    """)
    row = cur.fetchone()
    write_json("health.json", row)
    print("  health: exported")


def main():
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    print("Exporting JSON...")
    export_all(cur)

    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
