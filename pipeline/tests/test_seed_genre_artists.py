import seed_genre_artists as sga


def _fake_tags(names):
    return {"tags": {"tag": [{"name": n} for n in names]}}


def test_fetch_top_tags_filters_non_genre_tags(monkeypatch):
    monkeypatch.setattr(
        sga, "get_with_retry",
        lambda params, **kwargs: _fake_tags(["Rock", "seen live", "80s", "Jazz"]),
    )
    assert sga.fetch_top_tags(None) == ["rock", "jazz"]


def test_fetch_top_tags_dedupes_case_variants(monkeypatch):
    monkeypatch.setattr(
        sga, "get_with_retry",
        lambda params, **kwargs: _fake_tags(["Hip-Hop", "hip-hop", "rock"]),
    )
    assert sga.fetch_top_tags(None) == ["hip-hop", "rock"]


def test_fetch_top_tags_respects_limit(monkeypatch):
    monkeypatch.setattr(
        sga, "get_with_retry",
        lambda params, **kwargs: _fake_tags(["rock", "pop", "jazz", "folk"]),
    )
    assert sga.fetch_top_tags(None, limit=2) == ["rock", "pop"]


def test_seed_dry_run_makes_no_writes(monkeypatch):
    monkeypatch.setattr(
        sga, "fetch_top_tags", lambda bucket, limit=100: ["rock", "jazz"]
    )

    class ExplodingCursor:
        def execute(self, *a, **kw):
            raise AssertionError("dry-run must not touch the DB")

    sga.seed(conn=None, cur=ExplodingCursor(), dry_run=True)
