DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS artist_snapshots;
DROP TABLE IF EXISTS weekly_charts;
DROP TABLE IF EXISTS artists;


CREATE TABLE artists (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    mbid TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE weekly_charts (
    id SERIAL PRIMARY KEY,
    artist_id INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    page INTEGER NOT NULL,
    snapshot_date DATE NOT NULL,
    FOREIGN KEY (artist_id) REFERENCES artists(id)
);


CREATE TABLE artist_snapshots (
    id SERIAL PRIMARY KEY,
    artist_id INTEGER NOT NULL,
    listeners BIGINT NOT NULL,
    playcount BIGINT NOT NULL,
    snapshot_date DATE NOT NULL,
    FOREIGN KEY (artist_id) REFERENCES artists(id),
    UNIQUE (artist_id, snapshot_date)
);


CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    artist_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    tag_count INTEGER,
    FOREIGN KEY (artist_id) REFERENCES artists(id),
    UNIQUE (artist_id, tag)
);