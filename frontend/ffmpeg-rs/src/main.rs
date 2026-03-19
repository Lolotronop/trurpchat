use std::{
    env,
    ffi::OsString,
    io::Read,
    time::{Duration, Instant},
};

use ffmpeg_next as ffmpeg;
use ffmpeg_rs::{
    control_plane::ControlPlaneData,
    start::start,
    video_encoder::{EncoderSettings, OutputDestination, Preset},
};

pub fn main() -> Result<(), Box<dyn std::error::Error>> {
    ffmpeg::init()?;

    let args: Vec<OsString> = env::args_os().skip(1).collect();

    let joined = args
        .iter()
        .map(|s| s.to_string_lossy())
        .collect::<Vec<_>>()
        .join(" ");

    println!("{}, {}", joined, joined.len());

    // let srt_uri = "srt://trurpchr.ru:9999?streamid=trurpchr.ru/app/anita".to_string();
    // let srt_uri = "srt://trurpchr.ru:9999?streamid=127.0.0.1/app/1".to_string();
    // let destination = OutputDestination::Rtmp("rtmp://trurpchr.ru:1935/app/4".to_string());
    // let destination = OutputDestination::Rtmp("rtmp://localhost:1935/app/4".to_string());
    let destination = OutputDestination::Rtmp("output.flv".to_string());
    // let destination = OutputDestination::Srt(srt_uri);
    // let destination = OutputDestination::Srt("output.ts".to_string());

    let settings = EncoderSettings {
        destination,
        width: 1920,
        height: 1080,
        audio_bitrate: 192_000,
        video_bitrate: 6 * 1000 * 1000,
        fps: 30,
        preset: Preset::Balanced,
        use_hw_accel: true,
    };

    let control_plane = ControlPlaneData::new();
    std::thread::spawn({
        let control_plane = control_plane.clone();
        move || {
            let res = start(settings, control_plane);
            if res.is_err() {
                println!("Error: {:?}", res);
            }
        }
    });

    // Stop capture with enter into the terminal
    std::thread::spawn({
        let control_plane = control_plane.clone();
        move || {
            let mut stdin = std::io::stdin();
            let mut buf = [0u8; 1];
            while let Ok(n) = stdin.read(&mut buf) {
                if n == 0 {
                    break;
                }
                control_plane.stop();
                break;
            }
        }
    });

    let start = Instant::now();

    let thing = control_plane.wait_started();
    println!("Control: started {thing:?}");

    loop {
        println!("Time: {:?}", Instant::now() - start);
        if control_plane.should_stop() {
            println!("Stopping");
            break;
        }

        std::thread::sleep(Duration::from_millis(1000));
    }

    Ok(())
}
