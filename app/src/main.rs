pub mod server;
pub mod state;
pub mod types;
pub mod utils;

#[cfg(test)]
mod tests;

use crate::state::State;
use crate::types::{BrowserTask, Config, GetLinksParams, Result};
use crate::utils::{print_items, read_json_array_from_file};
use clap::{Args, Parser, Subcommand};
use obscura::Browser;
use serde_json::{from_str as json_from_str, to_string_pretty};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use tokio::sync::mpsc;

#[tokio::main]
async fn main() -> Result<()> {
    let args = Cli::parse();

    let config = if let Some(value) = &args.config {
        json_from_str(value)?
    } else {
        Config::find("config.json", 5).and_then(Config::new)?
    };

    let (tx, rx) = mpsc::channel::<BrowserTask>(16);
    spawn_browser_worker(rx);

    let state = State::new(config, tx)?;

    match &args.command {
        Some(Command::Init) => state.db.init().await,

        Some(Command::ProcessUrls {
            path,
            process_duplicates,
        }) => {
            let reader = BufReader::new(File::open(path)?);
            let items: Vec<String> = reader.lines().map_while(Result::ok).collect();

            let total = items.len();
            let failed = state.process_urls(items, *process_duplicates).await?;

            println!(
                "processed {} of {total} items. {} failed. \n\n{}",
                total - failed.len(),
                failed.len(),
                failed.join("\n")
            );

            Ok(())
        }

        Some(Command::GetLinks { params, ndjson }) => {
            let params: GetLinksParams = serde_json::from_str(params)?;
            let items = state.get_links(params).await?;

            print_items(&items, *ndjson)
        }

        Some(Command::GetDomains { ndjson }) => {
            let items = state.get_domains().await?;

            print_items(&items, *ndjson)
        }

        Some(Command::AddLinks(AddArgs { path, ndjson })) => {
            let items: Vec<_> = read_json_array_from_file(path, *ndjson)?;
            let len = items.len();

            state.add_links(items).await?;
            println!("added {len} items");

            Ok(())
        }

        Some(Command::AddDomains(AddArgs { path, ndjson })) => {
            let items: Vec<_> = read_json_array_from_file(path, *ndjson)?;
            let len = items.len();

            state.add_domains(items).await?;
            println!("added {len} items");

            Ok(())
        }

        Some(Command::GetConfig) => {
            let output = to_string_pretty(&state.config)?;
            println!("{output}");

            Ok(())
        }

        None => server::run(state, args.client_path).await,
    }
}

#[derive(Parser, Debug)]
#[command(version, about = "Manage your links")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
    /// Configuration as JSON
    #[arg(short, long, global = true)]
    pub config: Option<String>,
    /// Path to the client directory [default: "{exe_path}/client"]
    #[arg(long)]
    pub client_path: Option<PathBuf>,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Init the application's dependencies (eg. DB)
    Init,
    /// Process URLs into Links
    ProcessUrls {
        /// Path to the text file containing the URLs (one per line)
        #[arg(short, long)]
        path: PathBuf,
        /// Whether to process duplicate URLs
        #[arg(short = 'd', long)]
        process_duplicates: bool,
    },
    /// Get Links
    GetLinks {
        /// Parameters to filter the Links
        #[arg(default_value = "{}")]
        params: String,
        /// Output as newline delimited JSON (NDJSON)
        #[arg(short, long)]
        ndjson: bool,
    },
    /// Get Domains
    GetDomains {
        /// Output as newline delimited JSON (NDJSON)
        #[arg(short, long)]
        ndjson: bool,
    },
    /// Add Links
    AddLinks(AddArgs),
    /// Add Domains
    AddDomains(AddArgs),
    /// Get the parsed configuration as JSON
    GetConfig,
}

#[derive(Args, Debug)]
pub struct AddArgs {
    /// Path to the file containing the JSON
    #[arg(short, long)]
    path: PathBuf,
    /// Accept input as newline delimited JSON (NDJSON)
    #[arg(short, long)]
    ndjson: bool,
}

fn spawn_browser_worker(mut rx: mpsc::Receiver<BrowserTask>) {
    std::thread::spawn(|| -> Result<()> {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .inspect_err(|err| eprintln!("{err}"))?
            .block_on(async move {
                let browser = Browser::builder()
                    .stealth(true)
                    .build()
                    .inspect_err(|err| eprintln!("{err}"))?;

                while let Some(BrowserTask { url, res }) = rx.recv().await {
                    println!("browser task: {url}");

                    let content = async {
                        let mut page = browser.new_page().await?;
                        page.goto(url.as_str()).await?;

                        Ok(page.content())
                    }
                    .await;

                    _ = res.send(content);
                }

                Ok(())
            })
    });
}
