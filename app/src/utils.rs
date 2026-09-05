use crate::types::{Result, ScrapedData};
use anyhow::anyhow;
use scraper::{Html, Selector};
use serde::Serialize;
use serde::de::DeserializeOwned;
use std::fs::File;
use std::io;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::Path;
use url::Url;

pub fn print_items<T: Serialize>(items: &Vec<T>, nd: bool) -> Result<()> {
    let stdout = io::stdout();
    let mut writer = BufWriter::new(stdout.lock());

    if !nd {
        serde_json::to_writer_pretty(&mut writer, &items)?;
    } else {
        for item in items {
            serde_json::to_writer(&mut writer, &item)?;
            writer.write_all(b"\n")?;
        }
    }

    writer.flush()?;
    Ok(())
}

pub fn read_json_array_from_file<T: DeserializeOwned>(
    path: impl AsRef<Path>,
    ndjson: bool,
) -> Result<Vec<T>> {
    let reader = BufReader::new(File::open(path)?);

    let items = if !ndjson {
        serde_json::from_reader(reader)
    } else {
        reader
            .lines()
            .map_while(Result::ok)
            .map(|it| serde_json::from_str(&it))
            .collect()
    }?;

    Ok(items)
}

pub fn host_with_port(url: &Url) -> Option<String> {
    if let Some(port) = url.port() {
        Some(format!("{}:{port}", url.host_str()?))
    } else {
        Some(url.host_str()?.to_string())
    }
}

pub fn normalize_host(host: &str, strippable_prefixes: &[impl AsRef<str>]) -> String {
    let mut host = host.to_string();

    // repeatedly strip prefixes
    loop {
        let mut stripping = false;

        for prefix in strippable_prefixes {
            if let Some(rest) = host.strip_prefix(prefix.as_ref()) {
                host = rest.to_string();
                stripping = true;
                break;
            }
        }

        if !stripping {
            break;
        }
    }

    host
}

pub fn scrape_data(content: &str, url: &Url) -> Result<ScrapedData> {
    let document = Html::parse_document(content);

    let selector = Selector::parse("title").map_err(|err| anyhow!("{err}"))?;
    let title = document.select(&selector).next().map(|x| x.inner_html());

    let selector =
        Selector::parse(r#"meta[property="og:image"]"#).map_err(|err| anyhow!("{err}"))?;
    let thumbnail = document
        .select(&selector)
        .next()
        .and_then(|x| x.value().attr("content"))
        .map(|x| x.to_string());

    Ok(ScrapedData {
        title,
        thumbnail,
        icon: scrape_icon(&document, url.clone()),
    })
}

pub fn scrape_icon(document: &Html, mut url: Url) -> Option<String> {
    let selector = Selector::parse(r#"link[rel~="icon"]"#).ok()?;

    if let Some(href) = document
        .select(&selector)
        .next()
        .and_then(|x| x.value().attr("href"))
    {
        if href.starts_with("http") {
            return Some(href.to_string());
        } else {
            url.set_fragment(None);
            url.set_query(None);
            url.set_path(href);

            return Some(url.to_string());
        }
    }

    None
}
