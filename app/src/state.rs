use crate::types::{BrowserTask, Config, Db, Domain, GetLinksParams, Link, Result, ScrapedData};
use crate::utils::{host_with_port, scrape_data};
use anyhow::anyhow;
use futures::StreamExt;
use futures::stream;
use reqwest::Client as HttpClient;
use sqlx::{QueryBuilder, Sqlite};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::{Mutex, Semaphore};
use tokio::sync::{mpsc, oneshot};
use url::Url;

#[derive(Clone)]
pub struct State {
    pub http_client: HttpClient,
    pub config: Arc<Config>,
    pub db: Db,
    pub browser_tx: mpsc::Sender<BrowserTask>,
}

impl State {
    pub fn new(config: Config, browser_tx: mpsc::Sender<BrowserTask>) -> Result<Self> {
        let config = Arc::new(config);
        let db = Db::new(&config.db_path);

        let user_agent = format!("{}/{}", env!("CARGO_PKG_NAME"), env!("CARGO_PKG_VERSION"));
        let http_client = HttpClient::builder().user_agent(user_agent).build()?;

        Ok(Self {
            http_client,
            config,
            db,
            browser_tx,
        })
    }

    pub async fn process_urls(
        &self,
        urls: Vec<String>,
        process_duplicates: bool,
    ) -> Result<Vec<String>> {
        let mut urls: HashSet<String> = urls
            .into_iter()
            .map(|x| x.trim().to_string())
            .filter(|x| !x.is_empty())
            .collect();

        if urls.is_empty() {
            return Ok(Vec::new());
        }

        if !process_duplicates {
            let existing_urls: HashSet<String> = sqlx::query_scalar("SELECT url FROM links")
                .fetch_all(&self.db.pool)
                .await?
                .into_iter()
                .collect();

            urls = urls.difference(&existing_urls).cloned().collect();
        }

        let global_limit = Arc::new(Semaphore::new(16));
        let host_limiter = Arc::new(HostLimiter::new(4));

        let results: Vec<Result<(Link, Domain)>> = stream::iter(urls)
            .map(|url| {
                let global_limit = global_limit.clone();
                let host_limiter = host_limiter.clone();

                async move {
                    async {
                        let url = Url::parse(&url)?;
                        let host = host_with_port(&url).ok_or_else(|| anyhow!("host not found"))?;

                        let _global_permit = global_limit.acquire().await?;
                        let host_limit = host_limiter.get(&host).await;

                        let ScrapedData {
                            title,
                            thumbnail,
                            icon,
                        } = {
                            let _host_permit = host_limit.acquire().await?;

                            self.process_url(&url).await.unwrap_or_default()
                        };

                        Ok((
                            Link {
                                title,
                                thumbnail,
                                host: host.clone(),
                                url: url.to_string(),
                                ..Default::default()
                            },
                            Domain { icon, host },
                        ))
                    }
                    .await
                    .map_err(|err: anyhow::Error| anyhow!("[ {url} ] {err}"))
                }
            })
            .buffer_unordered(64)
            .collect()
            .await;

        let mut failed = Vec::new();
        let mut links = Vec::new();
        let mut domains: HashMap<String, Domain> = HashMap::new();

        for item in results {
            match item {
                Err(err) => failed.push(err.to_string()),
                Ok((link, domain)) => {
                    links.push(link);

                    if domains
                        .get(&domain.host)
                        .map_or(true, |existing| existing.icon.is_none())
                    {
                        domains.insert(domain.host.clone(), domain);
                    }
                }
            }
        }

        if !domains.is_empty() {
            QueryBuilder::new("INSERT INTO domains (host, icon) ")
                .push_values(domains.values(), |mut b, it| {
                    b.push_bind(&it.host).push_bind(&it.icon);
                })
                .push(
                    " ON CONFLICT(host) DO UPDATE SET icon = COALESCE(excluded.icon, domains.icon)",
                )
                .build()
                .execute(&self.db.pool)
                .await?;
        }

        if !links.is_empty() {
            QueryBuilder::new("INSERT INTO links (url, host, title, thumbnail) ")
                .push_values(links.iter(), |mut b, it| {
                    b.push_bind(&it.url)
                        .push_bind(&it.host)
                        .push_bind(&it.title)
                        .push_bind(&it.thumbnail);
                })
                .push(
                    " ON CONFLICT(url) DO UPDATE SET
                        title = COALESCE(excluded.title, links.title),
                        thumbnail = COALESCE(excluded.thumbnail, links.thumbnail),
                        modified = CURRENT_TIMESTAMP
                    WHERE
                        (excluded.title != links.title OR (excluded.title IS NULL) != (links.title IS NULL)) OR
                        (excluded.thumbnail != links.thumbnail OR (excluded.thumbnail IS NULL) != (links.thumbnail IS NULL))"
                )
                .build()
                .execute(&self.db.pool)
                .await?;
        }

        Ok(failed)
    }

    async fn process_url(&self, url: &Url) -> Result<ScrapedData> {
        let res = self
            .http_client
            .get(url.as_str())
            .send()
            .await
            .map_err(|err| anyhow!("{err}"))?;

        let content = res.text().await?;

        if let Ok(data) = scrape_data(&content, url)
            && data.title.is_some()
            && data.thumbnail.is_some()
            && data.icon.is_some()
        {
            Ok(data)
        } else {
            // cloudflare is a pain in the ass; fuck it!
            // just send page data from the browser extension

            let (tx, rx) = oneshot::channel();

            self.browser_tx
                .send(BrowserTask {
                    url: url.clone(),
                    res: tx,
                })
                .await
                .unwrap();

            let content = rx.await??;
            let data = scrape_data(&content, url)?;

            Ok(data)
        }
    }

    pub async fn get_links(&self, params: GetLinksParams) -> Result<Vec<Link>> {
        let mut builder = QueryBuilder::<Sqlite>::new("SELECT * FROM links WHERE 1=1");

        if let Some(host) = &params.host {
            builder.push(" AND host = ");
            builder.push_bind(host);
        }

        if params.favorite == Some(true) {
            builder.push(" AND favorite = true");
        }

        builder.push(" ORDER BY modified DESC");

        let items = builder.build_query_as().fetch_all(&self.db.pool).await?;

        Ok(items)
    }

    pub async fn get_domains(&self) -> Result<Vec<Domain>> {
        let items: Vec<Domain> = sqlx::query_as("SELECT * FROM domains ORDER BY host ASC")
            .fetch_all(&self.db.pool)
            .await?;

        Ok(items)
    }

    pub async fn add_links(&self, items: Vec<Link>) -> Result<()> {
        if items.is_empty() {
            return Ok(());
        }

        for chunk in items.chunks(32_766 / 6) {
            let mut qb = QueryBuilder::new(
                "INSERT INTO links (url, host, title, thumbnail, favorite, modified) ",
            );

            qb.push_values(chunk.iter(), |mut b, it| {
                b.push_bind(&it.url)
                    .push_bind(&it.host)
                    .push_bind(&it.title)
                    .push_bind(&it.thumbnail)
                    .push_bind(it.favorite);

                if let Some(modified) = it.modified.as_ref() {
                    b.push_bind(modified);
                } else {
                    b.push("CURRENT_TIMESTAMP");
                }
            });

            qb.push(
                " ON CONFLICT(url) DO UPDATE SET
                    title = COALESCE(excluded.title, links.title),
                    thumbnail = COALESCE(excluded.thumbnail, links.thumbnail),
                    modified = CURRENT_TIMESTAMP
                WHERE
                    (excluded.title != links.title OR (excluded.title IS NULL) != (links.title IS NULL)) OR
                    (excluded.thumbnail != links.thumbnail OR (excluded.thumbnail IS NULL) != (links.thumbnail IS NULL))"
            );

            qb.build().execute(&self.db.pool).await?;
        }

        Ok(())
    }

    pub async fn add_domains(&self, items: Vec<Domain>) -> Result<()> {
        if items.is_empty() {
            return Ok(());
        }

        for chunk in items.chunks(32_766 / 2) {
            let mut qb = QueryBuilder::new("INSERT INTO domains (host, icon) ");

            qb.push_values(chunk.iter(), |mut b, it| {
                b.push_bind(&it.host).push_bind(&it.icon);
            })
            .build()
            .execute(&self.db.pool)
            .await?;
        }

        Ok(())
    }

    pub async fn remove_links(&self, urls: Vec<String>) -> Result<()> {
        if urls.is_empty() {
            return Ok(());
        }

        let mut tx = self.db.pool.begin().await?;

        QueryBuilder::new("DELETE FROM links WHERE url IN (")
            .push_values(urls.iter(), |mut b, url| {
                b.push_bind(url);
            })
            .push(")")
            .build()
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            "DELETE FROM domains WHERE NOT EXISTS 
                (SELECT 1 FROM links WHERE links.host = domains.host)",
        )
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(())
    }

    pub async fn set_link_favorite(&self, url: String, favorite: bool) -> Result<()> {
        sqlx::query("UPDATE links SET favorite = ? WHERE url = ?")
            .bind(favorite)
            .bind(&url)
            .execute(&self.db.pool)
            .await?;

        Ok(())
    }

    pub async fn replace_host(&self, old: String, new: String) -> Result<()> {
        let mut tx = self.db.pool.begin().await?;

        let old_urls: Vec<String> = sqlx::query_scalar("SELECT url FROM links WHERE host = ?")
            .bind(&old)
            .fetch_all(&mut *tx)
            .await?;

        for old_url in old_urls {
            let mut new_url = Url::parse(&old_url)?;
            new_url.set_host(Some(&new))?;
            let new_url = new_url.to_string();

            let exists = sqlx::query("SELECT 1 FROM links WHERE url = ?")
                .bind(&new_url)
                .fetch_optional(&mut *tx)
                .await?
                .is_some();

            if exists {
                sqlx::query("DELETE FROM links WHERE url = ?")
                    .bind(&old_url)
                    .execute(&mut *tx)
                    .await?;
            } else {
                sqlx::query(
                    "UPDATE links SET url = ?, host = ?, modified = CURRENT_TIMESTAMP WHERE url = ?",
                )
                .bind(&new_url)
                .bind(&new)
                .bind(&old_url)
                .execute(&mut *tx)
                .await?;
            }
        }

        let new_domain_exists: bool = sqlx::query("SELECT 1 FROM domains WHERE host = ?")
            .bind(&new)
            .fetch_optional(&mut *tx)
            .await?
            .is_some();

        if new_domain_exists {
            sqlx::query("DELETE FROM domains WHERE host = ?")
                .bind(&old)
                .execute(&mut *tx)
                .await?;
        } else {
            sqlx::query("UPDATE domains SET host = ? WHERE host = ?")
                .bind(&new)
                .bind(&old)
                .execute(&mut *tx)
                .await?;
        }

        tx.commit().await?;

        Ok(())
    }
}

pub struct HostLimiter {
    map: Mutex<HashMap<String, Arc<Semaphore>>>,
    per_host_limit: usize,
}

impl HostLimiter {
    pub fn new(limit: usize) -> Self {
        Self {
            map: Mutex::new(HashMap::new()),
            per_host_limit: limit,
        }
    }

    pub async fn get(&self, host: &str) -> Arc<Semaphore> {
        let mut map = self.map.lock().await;

        map.entry(host.to_string())
            .or_insert_with(|| Arc::new(Semaphore::new(self.per_host_limit)))
            .clone()
    }
}
