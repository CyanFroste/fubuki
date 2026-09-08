use anyhow::anyhow;
use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use sqlx::prelude::FromRow;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::types::Json as SqlJson;
use sqlx::{Pool, Sqlite};
use std::env;
use std::fs::File;
use std::path::{Path, PathBuf};
use tokio::sync::oneshot;
use url::Url;

pub type Result<T, E = anyhow::Error> = std::result::Result<T, E>;

#[derive(Debug, Serialize, Deserialize, FromRow, Default)]
pub struct Link {
    pub url: String,
    pub host: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modified: Option<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub favorite: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<SqlJson<Vec<String>>>,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Default)]
pub struct Domain {
    pub host: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct GetLinksParams {
    pub host: Option<String>,
    pub favorite: Option<bool>,
}

#[derive(Debug, Default)]
pub struct ScrapedData {
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Counts {
    pub links: u64,
    pub domains: u64,
}

pub struct BrowserTask {
    pub url: Url,
    pub res: oneshot::Sender<Result<String>>,
}

#[derive(Debug, Clone)]
pub struct Db {
    pub pool: Pool<Sqlite>,
}

impl Db {
    pub fn new(path: impl AsRef<Path>) -> Self {
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_lazy_with(options);

        Self { pool }
    }

    pub async fn init(&self) -> Result<()> {
        sqlx::raw_sql(include_str!("./includes/init.sql"))
            .execute(&self.pool)
            .await?;

        Ok(())
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub port: u16,
    pub db_path: PathBuf,
    pub strippable_prefixes: Vec<String>,
}

impl Config {
    pub fn new(path: impl AsRef<Path>) -> Result<Self> {
        Ok(serde_json::from_reader(&File::open(path)?)?)
    }

    pub fn find(name: impl AsRef<str>, levels: usize) -> Result<PathBuf> {
        let name = name.as_ref();
        let path = env::current_exe()?;

        for ancestor in path.ancestors().skip(1).take(levels) {
            let path = ancestor.join(name);

            if path.exists() {
                return Ok(path);
            }
        }

        Err(anyhow!("config: {name} not found"))
    }
}

#[derive(Debug, Serialize)]
pub struct Error {
    pub message: String,
}

impl From<anyhow::Error> for Error {
    fn from(value: anyhow::Error) -> Self {
        Error {
            message: value.to_string(),
        }
    }
}

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(self)).into_response()
    }
}
