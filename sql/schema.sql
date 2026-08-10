CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;


CREATE TABLE IF NOT EXISTS artists (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    mbid TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error_code INTEGER,
    last_error_at TIMESTAMPTZ
);
-- Adds last_error_code/last_error_at to a pre-existing artists table;
-- CREATE TABLE IF NOT EXISTS above is a no-op on a live DB that already
-- has the table, so these columns need their own idempotent statement.
ALTER TABLE artists ADD COLUMN IF NOT EXISTS last_error_code INTEGER;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;


CREATE TABLE IF NOT EXISTS weekly_charts (
    id SERIAL PRIMARY KEY,
    artist_id INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    page INTEGER NOT NULL,
    snapshot_date DATE NOT NULL,
    FOREIGN KEY (artist_id) REFERENCES artists(id)
);


CREATE TABLE IF NOT EXISTS artist_snapshots (
    id SERIAL PRIMARY KEY,
    artist_id INTEGER NOT NULL,
    listeners BIGINT NOT NULL,
    playcount BIGINT NOT NULL,
    snapshot_date DATE NOT NULL,
    FOREIGN KEY (artist_id) REFERENCES artists(id),
    UNIQUE (artist_id, snapshot_date)
);


CREATE TABLE IF NOT EXISTS artist_similarities (
    id SERIAL PRIMARY KEY,
    artist_id INTEGER NOT NULL,
    similar_artist_id INTEGER ,
    similar_name TEXT NOT NULL,
    similar_mbid TEXT,
    similarity_score FLOAT NOT NULL,
    fetched_at DATE NOT NULL,
    FOREIGN KEY (artist_id) REFERENCES artists(id),
    FOREIGN KEY (similar_artist_id) REFERENCES artists(id),
    UNIQUE (artist_id, similar_name)
);


CREATE TABLE IF NOT EXISTS genres (
    id SERIAL PRIMARY KEY,
    genre TEXT NOT NULL UNIQUE,
    fetched_at DATE NOT NULL
);


CREATE TABLE IF NOT EXISTS genre_artists (
    id SERIAL PRIMARY KEY,
    genre_id INTEGER NOT NULL,
    artist_id INTEGER NOT NULL,
    rank_in_genre INTEGER NOT NULL,
    fetched_at DATE NOT NULL,
    FOREIGN KEY (genre_id) REFERENCES genres(id),
    FOREIGN KEY (artist_id) REFERENCES artists(id),
    UNIQUE (genre_id, artist_id)
);


CREATE TABLE IF NOT EXISTS countries (
    id SERIAL PRIMARY KEY,
    country TEXT NOT NULL UNIQUE,
    fetched_at DATE NOT NULL
);


CREATE TABLE IF NOT EXISTS country_artists (
    id SERIAL PRIMARY KEY,
    country_id INTEGER NOT NULL,
    artist_id INTEGER NOT NULL,
    rank_in_country INTEGER NOT NULL,
    fetched_at DATE NOT NULL,
    FOREIGN KEY (country_id) REFERENCES countries(id),
    FOREIGN KEY (artist_id) REFERENCES artists(id),
    UNIQUE (country_id, artist_id)
);


CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    artist_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    tag_count INTEGER,
    FOREIGN KEY (artist_id) REFERENCES artists(id),
    UNIQUE (artist_id, tag)
);


CREATE INDEX IF NOT EXISTS ix_snapshots_date ON artist_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS ix_weekly_charts_artist ON weekly_charts(artist_id);
CREATE INDEX IF NOT EXISTS ix_genre_artists_artist ON genre_artists(artist_id);
CREATE INDEX IF NOT EXISTS ix_country_artists_artist ON country_artists(artist_id);
CREATE INDEX IF NOT EXISTS ix_similar_target
    ON artist_similarities(similar_artist_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_artists_name_norm
    ON artists (lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS ux_weekly_charts
    ON weekly_charts (artist_id, page, rank, snapshot_date);