"""
audit_script.py — Last.fm API Endpoint Audit
=============================================
Purpose: Before writing any pipeline code, verify that the three Last.fm
endpoints we're planning to use actually return the data we need, at the
granularity we need it. This is a read-only exploration script — it writes
nothing to a database.

Run with:
    python audit_script.py

Requirements:
    pip install requests python-dotenv
"""

import os
import json
from dotenv import load_dotenv
import requests

# ---------------------------------------------------------------------------
# HOW API KEYS WORK (the big picture)
# ---------------------------------------------------------------------------
# An API key is just a long random string that the API provider (Last.fm)
# gave you when you registered. It works like a username: every request you
# send includes it so Last.fm knows who is asking.
#
# Last.fm's API is "read-only key auth" — meaning:
#   - You don't need to log in as a user (no OAuth dance).
#   - You just append &api_key=YOUR_KEY to every URL.
#   - Last.fm looks up your key in their database, checks your rate limits,
#     and returns data.
#
# WHY NOT HARDCODE THE KEY IN THIS FILE?
#   If you commit a file with your key in it, it's permanently in git history
#   and anyone who clones your repo can read it. API keys for free-tier
#   services get scraped and abused within hours.
#
#   The safe pattern: store the key in a .env file (which .gitignore excludes),
#   then load it into the environment at runtime with python-dotenv.
# ---------------------------------------------------------------------------

load_dotenv()  # reads .env in the current directory and sets environment vars
API_KEY = os.getenv("LASTFM_API_KEY")

if not API_KEY:
    raise SystemExit(
        "ERROR: LASTFM_API_KEY not found.\n"
        "Copy .env.example to .env and paste your key in there."
    )

# ---------------------------------------------------------------------------
# HOW HTTP REQUESTS WORK
# ---------------------------------------------------------------------------
# When your browser visits a webpage it sends an HTTP GET request to a server.
# The `requests` library lets Python do the same thing programmatically.
#
# A Last.fm API URL looks like:
#   http://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist=Arca&api_key=...&format=json
#
# Breaking that down:
#   - Base URL: http://ws.audioscrobbler.com/2.0/
#   - Query parameters (everything after '?'):
#       method=artist.getInfo   ← which endpoint to call
#       artist=Arca             ← the input argument
#       api_key=...             ← your credential
#       format=json             ← ask for JSON instead of XML (the default)
#
# `requests.get(url, params=dict)` builds that URL for you — you pass the
# parameters as a Python dict and it handles URL-encoding (spaces → %20, etc.)
# ---------------------------------------------------------------------------

BASE_URL = "http://ws.audioscrobbler.com/2.0/"

# Shared params included in every request.
# We'll merge these with endpoint-specific params using ** unpacking.
COMMON_PARAMS = {
    "api_key": API_KEY,
    "format": "json",
}


def get(params: dict) -> dict:
    """
    Make a GET request to the Last.fm API and return the parsed JSON.

    All Last.fm endpoints live at the same base URL; you select the endpoint
    with the 'method' parameter. This helper merges in the key and format so
    callers don't have to repeat them.

    Raises an exception if the HTTP request itself fails (network error,
    server 500, etc.). Last.fm also returns errors *inside* a 200 response
    (e.g. {"error": 6, "message": "Artist not found"}) — we surface those too.
    """
    # {**COMMON_PARAMS, **params} merges two dicts; params wins on conflicts.
    response = requests.get(BASE_URL, params={**COMMON_PARAMS, **params}, timeout=10)

    # raise_for_status() turns any HTTP 4xx/5xx response into a Python exception.
    # A 200 response does nothing here and execution continues normally.
    response.raise_for_status()

    data = response.json()

    # Last.fm returns HTTP 200 even for application-level errors, so we check
    # the payload itself for an "error" key.
    if "error" in data:
        raise ValueError(f"Last.fm error {data['error']}: {data['message']}")

    return data


def section(title: str):
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


# ---------------------------------------------------------------------------
# AUDIT 1: artist.getInfo
# ---------------------------------------------------------------------------
# Key questions:
#   - Does it return listener count and total play count?
#   - Are those numbers per-week or all-time totals?
#   - Is there enough info to identify "small" vs "large" artists?
#
# Spoiler from the docs: listeners and playcount are all-time cumulative
# totals, not time-series. To get longitudinal data we'd need to call this
# endpoint repeatedly over time and store snapshots — that's exactly what
# the artist_snapshots table is designed for.
# ---------------------------------------------------------------------------

def audit_artist_get_info():
    section("AUDIT 1: artist.getInfo")

    # We test with one "small" and one "large" artist so we can compare the
    # shape of the response and see what fields actually differ.
    test_artists = ["Arca", "Taylor Swift"]

    for artist_name in test_artists:
        print(f"\n--- Artist: {artist_name} ---")
        data = get({"method": "artist.getInfo", "artist": artist_name})

        artist = data["artist"]

        # The stats block is the most important part for our project.
        stats = artist.get("stats", {})
        listeners = stats.get("listeners", "NOT PRESENT")
        playcount = stats.get("playcount", "NOT PRESENT")

        print(f"  listeners : {listeners}")
        print(f"  playcount : {playcount}")

        # Tags tell us genre — useful if we want to filter by genre later.
        tags = [t["name"] for t in artist.get("tags", {}).get("tag", [])]
        print(f"  top tags  : {tags}")

        # bio summary often has useful metadata
        bio = artist.get("bio", {}).get("summary", "")
        print(f"  bio chars : {len(bio)} (truncated)")

    print("\nCONCLUSION: listener/playcount are cumulative all-time totals.")
    print("To build a time series we must snapshot this endpoint repeatedly.")
    print("This is feasible — it's the core pattern of artist_snapshots.")


# ---------------------------------------------------------------------------
# AUDIT 2: chart.getTopArtists
# ---------------------------------------------------------------------------
# Key questions:
#   - What does "chart" mean here — is there a date range?
#   - How many artists are returned? Is it paginated?
#   - Can we go back in time, or is it always the current week?
#
# This endpoint returns *current* chart standings (top artists globally right
# now). It does NOT let you query past charts. For historical chart data we
# need artist.getWeeklyChartList (audit 3).
# ---------------------------------------------------------------------------

def audit_chart_get_top_artists():
    section("AUDIT 2: chart.getTopArtists")

    # limit controls how many results per page; page lets you paginate.
    data = get({"method": "chart.getTopArtists", "limit": 5, "page": 1})

    chart = data.get("artists", {})
    artists = chart.get("artist", [])

    # The @attr block contains pagination metadata — important for deciding
    # how deep we can realistically scrape.
    attr = chart.get("@attr", {})
    print(f"\n  Total artists available : {attr.get('total', 'unknown')}")
    print(f"  Current page            : {attr.get('page', 'unknown')}")
    print(f"  Per page (limit)        : {attr.get('perPage', 'unknown')}")
    print(f"  Total pages             : {attr.get('totalPages', 'unknown')}")

    print(f"\n  Top {len(artists)} artists in current chart:")
    for i, a in enumerate(artists, 1):
        print(f"    {i}. {a['name']:30s}  listeners={a.get('listeners','?'):>10}  playcount={a.get('playcount','?'):>12}")

    print("\nCONCLUSION: chart.getTopArtists = current global chart only.")
    print("No date parameter exists — you cannot query past chart snapshots here.")
    print("For historical chart data, use chart.getWeeklyChartList (audit 3).")


# ---------------------------------------------------------------------------
# AUDIT 3: chart.getWeeklyChartList  +  user.getWeeklyArtistChart
# ---------------------------------------------------------------------------
# Key questions:
#   - Does Last.fm expose historical *global* weekly charts?
#   - How far back does the data go?
#   - What granularity / format are the timestamps in?
#
# IMPORTANT NOTE: There is no "chart.getWeeklyChartList" — that endpoint
# applies to *user* listening history, not global charts. The correct call for
# global weekly chart history is user.getWeeklyArtistChart on a specific user,
# or we use chart.getTopArtists repeatedly. We test both patterns here so we
# know exactly what's available.
#
# Last.fm's "charts" API is historically user-centric (it grew out of
# Audioscrobbler, a personal scrobbling service). Global chart data is more
# limited than per-user data.
# ---------------------------------------------------------------------------

def audit_weekly_chart():
    section("AUDIT 3: Weekly Chart History")

    print("\n--- 3a: user.getWeeklyChartList (list of available weeks) ---")
    print("This returns a list of {from, to} Unix timestamp pairs for which")
    print("weekly chart data exists for a given Last.fm user account.")
    print("We use 'rj' (Last.fm founder) as a proxy for 'how far back does data go'.")

    data = get({"method": "user.getWeeklyChartList", "user": "rj"})

    charts = data.get("weeklychartlist", {}).get("chart", [])
    print(f"\n  Total weekly chart snapshots available for user 'rj': {len(charts)}")

    import datetime

    def ts(unix_str):
        # Unix timestamp = seconds since 1970-01-01 UTC. Convert to readable date.
        return datetime.datetime.fromtimestamp(int(unix_str), datetime.timezone.utc).strftime("%Y-%m-%d")

    if charts:
        oldest = charts[0]
        newest = charts[-1]
        print(f"  Oldest available week : {ts(oldest['from'])}  ->  {ts(oldest['to'])}")
        print(f"  Newest available week : {ts(newest['from'])}  ->  {ts(newest['to'])}")

    print("\n--- 3b: user.getWeeklyArtistChart (artists for one week) ---")
    print("Given a {from, to} pair, this returns the top artists a user")
    print("listened to in that week. Useful for per-user data, but not a")
    print("global chart. We'll look at one week to see the response shape.")

    if charts:
        # Grab the most recent week to inspect
        recent = charts[-1]
        chart_data = get({
            "method": "user.getWeeklyArtistChart",
            "user": "rj",
            "from": recent["from"],
            "to": recent["to"],
            "limit": 5,
        })

        weekly_artists = chart_data.get("weeklyartistchart", {}).get("artist", [])
        print(f"\n  Top artists for week ending {ts(recent['to'])}:")
        for i, a in enumerate(weekly_artists, 1):
            print(f"    {i}. {a.get('name', '?'):30s}  scrobbles={a.get('playcount', '?')}")

    print("\nCONCLUSION: Weekly chart history exists but is *per-user*, not global.")
    print("Global chart: use chart.getTopArtists (paginated, current week only).")
    print("For longitudinal analysis, the viable pattern is:")
    print("  -> Snapshot artist.getInfo (listeners/playcount) on a schedule")
    print("  -> Store each snapshot row in artist_snapshots with a timestamp")
    print("  -> After N weeks of collection, we have our time series")


# ---------------------------------------------------------------------------
# MAIN — run all three audits and print a summary
# ---------------------------------------------------------------------------

def main():
    print("Last.fm API Audit — music-growth-pipeline")
    print("Running three endpoint checks. Each section prints raw findings.")
    print("Read the CONCLUSION lines for the take-aways that affect schema/pipeline design.")

    audit_artist_get_info()
    audit_chart_get_top_artists()
    audit_weekly_chart()

    section("OVERALL SUMMARY")
    print("""
  Data we CAN get from Last.fm:
    - All-time listener count and play count per artist (artist.getInfo)
    - Current global top-artist chart, paginated (chart.getTopArtists)
    - Per-user weekly artist history going back to ~2005 (user.getWeeklyArtistChart)

  Data we CANNOT get easily:
    - Historical *global* weekly charts (no time-travel on chart.getTopArtists)
    - True listener growth curves (no built-in time series — must build ourselves)

  Recommended pipeline approach:
    1. Seed the artists table from chart.getTopArtists (global chart, page 1-N)
       Focus on lower-ranked pages to capture smaller artists.
    2. Run a weekly snapshot job: for each artist, call artist.getInfo and
       insert a row into artist_snapshots with the timestamp + listener count.
    3. After several weeks of data, the correlation analysis becomes possible.

  Backup plan feasibility:
    Cross-sectional analysis (chart vs non-chart listener distributions) is
    fully viable right now with a single snapshot — no waiting required.
    This is a good MVP to build while the longitudinal data accumulates.
""")


if __name__ == "__main__":
    main()
