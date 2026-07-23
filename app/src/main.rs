pub mod server;
pub mod state;
pub mod types;
pub mod utils;

use crate::state::State;
use crate::types::{Config, GetLinksParams, Result};
use crate::utils::{print_items, read_json_array_from_file};
use clap::{Args, Parser, Subcommand};
use reqwest::Client as HttpClient;
use serde_json::to_string_pretty;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

#[tokio::main]
async fn main() -> Result<()> {
    let args = Cli::parse();
    let config = Config::find("config.json", 5).and_then(Config::new)?;

    let user_agent = format!("{}/{}", env!("CARGO_PKG_NAME"), env!("CARGO_PKG_VERSION"));
    let http_client = HttpClient::builder().user_agent(user_agent).build()?;
    let state = State::new(config, http_client);

    match &args.command {
        Some(Command::Init) => state.db.init().await,

        Some(Command::ProcessUrls { path }) => {
            let reader = BufReader::new(File::open(path)?);
            let items: Vec<String> = reader.lines().map_while(Result::ok).collect();

            let total = items.len();
            let failed = state.process_urls(items).await?;

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

        None => server::run(state).await,
    }
}

#[derive(Parser, Debug)]
#[command(version, about = "Manage and process Doujinshi from multiple sources")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
    /// Namespace of the variables provided in the configuration
    #[arg(short, long, default_value = "default", global = true)]
    pub config: String,
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
