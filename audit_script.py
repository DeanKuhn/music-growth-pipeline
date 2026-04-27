import os
import datetime
from dotenv import load_dotenv # type:ignore
import requests # type:ignore


load_dotenv()
API_KEY = os.getenv("LASTFM_API_KEY")

if not API_KEY:
    raise SystemExit(
        "ERROR: LASTFM_API_KEY not found.\n"
        "Copy .env.example to .env and paste your key in there."
    )

# Example URL:
# http://ws.audioscrobbler.com/2.0/
# ?method=artist.getInfo
# &artist=Arca
# &api_key=...
# &format=json

# Base URL all our endpoints will use
BASE_URL = "http://ws.audioscrobbler.com/2.0/"

# Shared params in most requests
COMMON_PARAMS = {
    "api_key": API_KEY,
    "format": "json",
}


def get(params: dict) -> dict:
    # {**COMMON_PARAMS, **params} merges two dicts; params wins on conflicts
    response = \
        requests.get(BASE_URL, params={**COMMON_PARAMS, **params}, timeout=10)

    # raise_for_status() turns any HTTP 400-599 response into an exception
    response.raise_for_status()

    data = response.json()

    # After response, double check for 200 responses with error messages
    if "error" in data:
        raise ValueError(f"Last.fm error {data["error"]}: {data["message"]}")

    return data


def section(title: str):
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


def audit_artist_get_info():
    section("AUDIT 1: artist.getInfo")

    # Test with a smaller and larger artist
    test_artists = ["Arca", "Taylor Swift"]

    for artist_name in test_artists:
        print(f"\n--- Artist: {artist_name} ---")
        data = get({"method": "artist.getInfo", "artist": artist_name})

        artist = data["artist"]

        # The stats block is the most important part for our project
        stats = artist.get("stats", {})
        listeners = stats.get("listeners", "NOT PRESENT")
        playcount = stats.get("playcount", "NOT PRESENT")

        print(f"  listeners : {listeners}")
        print(f"  playcount : {playcount}")

        # Tags tell us genre, useful if we want to filter by genre later
        tags = [t["name"] for t in artist.get("tags", {}).get("tag", [])]
        print(f"  top tags  : {tags}")

        # Bio summary often has useful metadata
        bio = artist.get("bio", {}).get("summary", "")
        print(f"  bio chars : {len(bio)} (truncated)")


def audit_chart_get_top_artists():
    section("AUDIT 2: chart.getTopArtists")

    # Limit controls how many results per page; page lets you paginate
    data = get({"method": "chart.getTopArtists", "limit": 5, "page": 1})

    chart = data.get("artists", {})
    artists = chart.get("artist", [])

    # The @attr block contains pagination metadata
    attr = chart.get("@attr", {})
    print(f"\n  Total artists available : {attr.get('total', 'unknown')}")
    print(f"  Current page            : {attr.get('page', 'unknown')}")
    print(f"  Per page (limit)        : {attr.get('perPage', 'unknown')}")
    print(f"  Total pages             : {attr.get('totalPages', 'unknown')}")

    print(f"\n  Top {len(artists)} artists in current chart:")
    for i, a in enumerate(artists, 1):
        print(f"    {i}. {a['name']:30s}  listeners={a.get('listeners','?'):>10}  "\
              f"playcount={a.get('playcount','?'):>12}")


def audit_weekly_chart():
    section("AUDIT 3: Weekly Chart History")

    print("\n--- 3a: user.getWeeklyChartList (list of available weeks) ---")
    data = get({"method": "user.getWeeklyChartList", "user": "rj"})

    charts = data.get("weeklychartlist", {}).get("chart", [])
    print(f"\n  Total weekly chart snapshots available for user 'rj': {len(charts)}")


    # Converts epoch to readable time
    def ts(unix_str):
        return datetime.datetime.fromtimestamp(
            int(unix_str), datetime.timezone.utc).strftime("%Y-%m-%d")

    if charts:
        oldest = charts[0]
        newest = charts[-1]
        print(f"  Oldest available week : {ts(oldest['from'])} "\
              f"  ->  {ts(oldest['to'])}")
        print(f"  Newest available week : {ts(newest['from'])} "\
              f" ->  {ts(newest['to'])}")

    print("\n--- 3b: user.getWeeklyArtistChart (artists for one week) ---")

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
            print(f"    {i}. {a.get('name', '?'):30s}  "\
                  f"scrobbles={a.get('playcount', '?')}")


# run all three audits and print a summary
if __name__ == "__main__":
    print("Last.fm API Audit — music-growth-pipeline")
    print("Running three endpoint checks. Each section prints raw findings.")

    audit_artist_get_info()
    audit_chart_get_top_artists()
    audit_weekly_chart()