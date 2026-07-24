// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use anyhow::Result;

#[tokio::main]
async fn main() -> Result<()> {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![])
        // .setup(|app| {
        //     #[cfg(any(windows, target_os = "linux"))]
        //     {
        //         use tauri_plugin_deep_link::DeepLinkExt;
        //         app.deep_link().register_all()?;
        //     }
        //     Ok(())
        // })
        .run(tauri::generate_context!())?;

    Ok(())
}
