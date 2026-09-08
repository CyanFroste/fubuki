CREATE TABLE IF NOT EXISTS links (
    url             TEXT        NOT NULL PRIMARY KEY,
    host            TEXT        NOT NULL,
    modified        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    favorite        BOOLEAN     NOT NULL DEFAULT FALSE,
    title           TEXT,    
    thumbnail       TEXT,
    tags            JSONB
);

CREATE TABLE IF NOT EXISTS domains (
    host            TEXT        NOT NULL PRIMARY KEY,    
    icon            TEXT
);

CREATE TABLE IF NOT EXISTS tags (
    name            TEXT        NOT NULL PRIMARY KEY    
);