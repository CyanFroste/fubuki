CREATE TABLE IF NOT EXISTS links (
    url             TEXT        NOT NULL PRIMARY KEY,
    host            TEXT        NOT NULL,
    modified        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    favorite        BOOLEAN     NOT NULL DEFAULT FALSE,
    title           TEXT,    
    thumbnail       TEXT
);

CREATE TABLE IF NOT EXISTS domains (
    host            TEXT        NOT NULL PRIMARY KEY,    
    icon            TEXT
);
