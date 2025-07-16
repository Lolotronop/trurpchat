use tauri::{AppHandle, Manager};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2Profile4, ICoreWebView2_13, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
};
use windows::core::{Interface, PCWSTR};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_permissions(origin: &str, app: AppHandle) {
    let webview = app.get_webview_window("main").unwrap();
    let mut origin = origin.to_string();
    origin.push('\0');
    let origin = origin.encode_utf16().collect::<Vec<u16>>();
    webview
        .with_webview(move |webview| unsafe {
            let core = webview.controller().CoreWebView2().unwrap();
            let core = Interface::cast::<ICoreWebView2_13>(&core).unwrap();
            let profile = core.Profile().unwrap();
            let profile = Interface::cast::<ICoreWebView2Profile4>(&profile).unwrap();
            let origin = PCWSTR::from_raw(origin.as_ptr());
            profile
                .SetPermissionState(
                    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
                    origin,
                    COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                    None,
                )
                .unwrap();
            profile
                .SetPermissionState(
                    COREWEBVIEW2_PERMISSION_KIND_CAMERA,
                    origin,
                    COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                    None,
                )
                .unwrap();
        })
        .unwrap();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, get_permissions])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
