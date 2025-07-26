use tauri::{AppHandle, Manager};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2Profile4, ICoreWebView2_13, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
};
use windows::core::{Interface, PCWSTR};
use windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY as VK;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP,
};

fn send_media_play_pause() -> Result<u32, windows::core::Error> {
    let inputs = [
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VK(0xB3),
                    wScan: 0,
                    dwFlags: KEYEVENTF_EXTENDEDKEY,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VK(0xB3),
                    wScan: 0,
                    dwFlags: KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
    ];

    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    Ok(sent)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn pause() {
    let result = send_media_play_pause();
    match result {
        Ok(_) => println!("Media play/pause sent successfully"),
        Err(e) => println!("Error sending media play/pause: {}", e),
    }
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
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, get_permissions, pause])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
