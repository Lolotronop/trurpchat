use ffmpeg_rs::video_encoder::{EncoderSettings, OutputDestination, Preset};
use ffmpeg_rs::{
    self,
    control_plane::{ControlPlane, ControlPlaneData, ControlPlaneState},
};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
use tauri_plugin_notification::NotificationExt;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2Profile4, ICoreWebView2_13, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
};
use windows::core::{Interface, PCWSTR};
use windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY as VK;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP,
};

struct StreamStopSignal {
    control_plane: ControlPlane,
}

#[tauri::command]
fn start_stream(
    app: AppHandle,
    state: State<'_, StreamStopSignal>,
    url: String,
    width: u32,
    height: u32,
    audio_bitrate: usize,
    video_bitrate: usize,
    fps: u32,
    preset_num: u32,
    use_hw_accel: bool,
) {
    if !state.control_plane.is_off() {
        state.control_plane.stop();
        state.control_plane.wait_off();
    }
    state.control_plane.set(ControlPlaneState::Starting);
    log::info!("Starting stream with url: {}", url);
    let destination = OutputDestination::Rtmp(url);
    let preset = match preset_num {
        0 => Preset::Fast,
        1 => Preset::Balanced,
        2 => Preset::Quality,
        _ => Preset::Balanced,
    };
    let settings = EncoderSettings {
        destination,
        width,
        height,
        audio_bitrate,
        video_bitrate,
        fps,
        preset,
        use_hw_accel,
    };

    std::thread::spawn({
        let control_plane = state.control_plane.clone();
        move || {
            let stream_started_at = std::sync::Arc::new(std::sync::Mutex::new(None::<Instant>));
            std::thread::spawn({
                let control_plane = control_plane.clone();
                let app = app.clone();
                let stream_started_at = stream_started_at.clone();
                move || {
                    if control_plane.wait_started() {
                        *stream_started_at.lock().unwrap() = Some(Instant::now());
                        if let Err(e) = app.emit("stream-status", true) {
                            log::error!("Error emitting stream-status: {:?}", e);
                        }
                    }
                }
            });
            let res = ffmpeg_rs::start::start(settings, control_plane);
            if let Err(e) = res {
                log::error!("Error during stream: {}", e);
            }
            if let Err(e) = app.emit("stream-status", false) {
                log::error!("Error emitting stream-status: {:?}", e);
            }
            let started_at = *stream_started_at.lock().unwrap();
            if let Some(started_at) = started_at {
                if started_at.elapsed() < Duration::from_millis(500) {
                    if let Err(e) = app
                        .notification()
                        .builder()
                        .title("Предупреждение")
                        .body("Стрим завершился слишком быстро. Если окно, которое вы захватываете, было свернуто, такое может произойти. Разверните окно и попробуйте снова.")
                        .show()
                    {
                        log::error!("Error showing notification: {:?}", e);
                    }
                }
            }
        }
    });
}

#[tauri::command]
fn stop_stream(state: State<'_, StreamStopSignal>) {
    state.control_plane.stop();
}

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
        Ok(_) => log::info!("Media play/pause sent successfully"),
        Err(e) => log::error!("Error sending media play/pause: {}", e),
    }
}

#[tauri::command]
fn get_permissions(origin: &str, app: AppHandle) {
    let webview = match app.get_webview_window("main") {
        Some(webview) => webview,
        None => {
            log::error!("Error getting webview");
            return;
        }
    };

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
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Trace)
                .level_for("wasapi", log::LevelFilter::Off)
                .level_for("cpal", log::LevelFilter::Off)
                .level_for("hyper", log::LevelFilter::Warn)
                .level_for("h2", log::LevelFilter::Warn)
                .level_for("rustls", log::LevelFilter::Warn)
                .level_for("wry", log::LevelFilter::Warn)
                .level_for("tao", log::LevelFilter::Warn)
                .level_for("tracing", log::LevelFilter::Warn)
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::Webview),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("trurpchat_log".into()),
                    }),
                ])
                .rotation_strategy(RotationStrategy::KeepAll)
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_permissions,
            pause,
            start_stream,
            stop_stream,
        ])
        .setup(|app| {
            let control_plane = ControlPlaneData::new();
            let stop_signal = StreamStopSignal { control_plane };
            app.manage(stop_signal);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
