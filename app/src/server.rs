use crate::state::State;
use crate::types::{Domain, Error, GetLinksParams, Link, Result};
use anyhow::Context;
use axum::extract::{DefaultBodyLimit, State as StateExtractor};
use axum::response::IntoResponse;
use axum::routing::post;
use axum::{Json, Router};
use std::env;
use std::path::PathBuf;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};

pub async fn run(state: State, client_path: Option<PathBuf>) -> Result<()> {
    let port = state.config.port;
    let listener = TcpListener::bind(("0.0.0.0", port)).await?;

    let static_service = if !cfg!(debug_assertions) {
        let client_path = client_path
            .or_else(|| Some(env::current_exe().ok()?.parent()?.join("client")))
            .filter(|x| x.exists())
            .context("client not found")?;

        Some(ServeDir::new(&client_path).fallback(ServeFile::new(client_path.join("index.html"))))
    } else {
        None
    };

    let api_routes = Router::new()
        .route("/process-urls", post(process_urls_handler))
        .route("/get-links", post(get_links_handler))
        .route("/get-domains", post(get_domains_handler))
        .route("/add-links", post(add_links_handler))
        .route("/add-domains", post(add_domains_handler))
        .route("/remove-links", post(remove_links_handler))
        .route("/set-link-favorite", post(set_link_favorite_handler))
        .route("/set-link-tags", post(set_link_tags_handler))
        .route("/replace-host", post(replace_host_handler))
        .route("/get-counts", post(get_counts_handler))
        .route("/get-tags", post(get_tags_handler))
        .route("/set-tags", post(set_tags_handler))
        .route("/extract-link-tags", post(extract_link_tags_handler))
        .route("/get-config", post(get_config_handler))
        .with_state(state);

    let mut router = Router::new().nest("/api", api_routes);

    if let Some(service) = static_service {
        router = router.fallback_service(service);
    }

    router = router
        .layer(DefaultBodyLimit::disable())
        .layer(CorsLayer::permissive());

    let server = axum::serve(listener, router).with_graceful_shutdown(shutdown_signal());
    let url = format!("http://localhost:{port}");

    println!("[server] running on {url}");
    server.await?;

    Ok(())
}

pub async fn process_urls_handler(
    state: StateExtractor<State>,
    Json((urls, process_duplicates)): Json<(Vec<String>, bool)>,
) -> Result<impl IntoResponse, Error> {
    Ok(Json(state.process_urls(urls, process_duplicates).await?))
}

pub async fn get_links_handler(
    state: StateExtractor<State>,
    Json(params): Json<GetLinksParams>,
) -> Result<impl IntoResponse, Error> {
    Ok(Json(state.get_links(params).await?))
}

pub async fn get_domains_handler(state: StateExtractor<State>) -> Result<impl IntoResponse, Error> {
    Ok(Json(state.get_domains().await?))
}

pub async fn add_links_handler(
    state: StateExtractor<State>,
    Json(items): Json<Vec<Link>>,
) -> Result<impl IntoResponse, Error> {
    Ok(Json(state.add_links(items).await?))
}

pub async fn add_domains_handler(
    state: StateExtractor<State>,
    Json(items): Json<Vec<Domain>>,
) -> Result<impl IntoResponse, Error> {
    Ok(Json(state.add_domains(items).await?))
}

pub async fn remove_links_handler(
    state: StateExtractor<State>,
    Json(urls): Json<Vec<String>>,
) -> Result<impl IntoResponse, Error> {
    Ok(Json(state.remove_links(urls).await?))
}

pub async fn set_link_favorite_handler(
    state: StateExtractor<State>,
    Json((url, favorite)): Json<(String, bool)>,
) -> Result<impl IntoResponse, Error> {
    Ok(Json(state.set_link_favorite(url, favorite).await?))
}

pub async fn set_link_tags_handler(
    state: StateExtractor<State>,
    Json((url, tags)): Json<(String, Vec<String>)>,
) -> Result<impl IntoResponse, Error> {
    Ok(Json(state.set_link_tags(url, tags).await?))
}

pub async fn replace_host_handler(
    state: StateExtractor<State>,
    Json((old, new)): Json<(String, String)>,
) -> Result<impl IntoResponse, Error> {
    Ok(Json(state.replace_host(old, new).await?))
}

pub async fn get_counts_handler(state: StateExtractor<State>) -> Result<impl IntoResponse, Error> {
    Ok(Json(state.get_counts().await?))
}

pub async fn get_tags_handler(state: StateExtractor<State>) -> Result<impl IntoResponse, Error> {
    Ok(Json(state.get_tags().await?))
}

pub async fn set_tags_handler(
    state: StateExtractor<State>,
    Json(items): Json<Vec<String>>,
) -> Result<impl IntoResponse, Error> {
    Ok(Json(state.set_tags(items).await?))
}

pub async fn extract_link_tags_handler(
    state: StateExtractor<State>,
    Json(item): Json<Link>,
) -> Result<impl IntoResponse, Error> {
    let ref_tags = state.get_tags().await?;

    Ok(Json(state.extract_link_tags(&item, &ref_tags)))
}

pub async fn get_config_handler(state: StateExtractor<State>) -> Result<impl IntoResponse, Error> {
    Ok(Json(state.config.clone()))
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("failed to listen for ctrl-c");
}
