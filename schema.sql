CREATE TABLE IF NOT EXISTS artists (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    mbid TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


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