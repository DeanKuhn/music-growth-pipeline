import seed_country_artists as sca


def test_country_list_has_fifty_entries():
    assert len(sca.COUNTRY_LIST) == 50


def test_seed_dry_run_makes_no_writes():
    class ExplodingCursor:
        def execute(self, *a, **kw):
            raise AssertionError("dry-run must not touch the DB")

    sca.seed(conn=None, cur=ExplodingCursor(), dry_run=True)


def test_seed_dry_run_respects_country_limit(caplog):
    class ExplodingCursor:
        def execute(self, *a, **kw):
            raise AssertionError("dry-run must not touch the DB")

    with caplog.at_level("INFO"):
        sca.seed(conn=None, cur=ExplodingCursor(), country_limit=3, dry_run=True)

    assert "Would seed 3 countries" in caplog.text
    assert "United States" in caplog.text
    assert "Canada" in caplog.text
    assert "Brazil" not in caplog.text
