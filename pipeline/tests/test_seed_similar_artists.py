import seed_similar_artists as ssa


class RecordingCursor:
    def __init__(self):
        self.executed_sql = None
        self.executed_params = None

    def execute(self, sql, params=None):
        self.executed_sql = sql
        self.executed_params = params

    def fetchall(self):
        return []


class FakeConn:
    def __init__(self):
        self.commits = 0

    def commit(self):
        self.commits += 1


def test_seed_population_query_filters_to_tracked_population():
    cur = RecordingCursor()
    conn = FakeConn()

    ssa.seed(conn, cur)

    sql = cur.executed_sql
    assert "weekly_charts" in sql
    assert "genre_artists" in sql
    assert "country_artists" in sql
    assert "artist_snapshots" in sql
    assert "artist_similarities" in sql


def test_seed_population_query_applies_limit():
    cur = RecordingCursor()
    conn = FakeConn()

    ssa.seed(conn, cur, limit=50)

    assert "LIMIT" in cur.executed_sql
    assert cur.executed_params == [50]
