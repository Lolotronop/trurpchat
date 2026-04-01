use ffmpeg_next::{self as ffmpeg};
use std::{
    sync::{Arc, mpsc},
    thread,
};

use crate::{
    audio_capture,
    audio_encoder::{AUDIO_SAMPLE_RATE, AudioEncoderBuilder},
    control_plane::*,
    frame_ring::FrameRing,
    pts_source, video_capture,
    video_encoder::*,
};

/// expects you to call ffmpeg::init() beforehand
pub fn start(
    settings: EncoderSettings,
    control_plane: ControlPlane,
) -> Result<(), Box<dyn std::error::Error>> {
    control_plane.set(ControlPlaneState::Starting);

    let pts_source = Arc::new(pts_source::AudioPtsSource::new(
        settings.fps,
        AUDIO_SAMPLE_RATE,
    ));
    let frame_ring = Arc::new(FrameRing::new(
        4,
        ffmpeg::format::Pixel::NV12,
        settings.width,
        settings.height,
        pts_source.clone(),
    ));

    let (output_sender, output_receiver) = mpsc::channel::<ffmpeg::Packet>();
    let (format_name, path) = settings.destination.to_format_path();
    let mut octx = ffmpeg::format::output_as(&path, format_name)?;
    let global_header = octx
        .format()
        .flags()
        .contains(ffmpeg::format::Flags::GLOBAL_HEADER);

    let mut audio_encoder_builder = {
        let output = output_sender.clone();
        let settings = settings.clone();
        let control_plane = control_plane.clone();
        AudioEncoderBuilder::new(settings, global_header, control_plane, output).unwrap()
    };

    let mut video_encoder_builder = {
        let control_plane = control_plane.clone();
        let output = output_sender.clone();
        let settings = settings.clone();
        let frame_ring = frame_ring.clone();
        VideoEncoderBuilder::new(settings, global_header, control_plane, output, frame_ring)
            .unwrap()
    };

    audio_encoder_builder.add_to_output(&mut octx).unwrap();
    video_encoder_builder.add_to_output(&mut octx).unwrap();

    octx.write_header().unwrap();

    audio_encoder_builder.set_output_timebase(&mut octx);
    video_encoder_builder.set_output_timebase(&mut octx);

    let audio_encoder = audio_encoder_builder.build();
    video_encoder_builder.inherit_audio_pts(audio_encoder.last_pts.clone());
    let video_encoder = video_encoder_builder.build();

    let (pid_send, pid_recv) = std::sync::mpsc::channel();

    let video_capture_thread = thread::spawn({
        let settings = settings.clone();
        let frame_ring = frame_ring.clone();
        let control_plane = control_plane.clone();
        let pts_source = pts_source.clone();
        move || {
            let settings = video_capture::HandlerFlags {
                control_plane,
                settings,
                frame_ring,
                pid_send,
                pts_source,
            };
            video_capture::capture(settings);
        }
    });

    let writer_thread = std::thread::spawn({
        let control_plane = control_plane.clone();
        move || {
            let mut started = false;
            if let Ok(packet) = output_receiver.recv() {
                if started == false {
                    control_plane.streaming();
                    started = true;
                }

                if packet.dts().is_none() {
                    println!("Dts is none!");
                }

                let res = packet.write_interleaved(&mut octx);
                if res.is_err() {
                    println!("Error writing packet: {:?}", res);
                    control_plane.stop();
                }
            }

            octx.write_trailer().unwrap();
        }
    });
    drop(output_sender);

    let audio_capture_thread = std::thread::spawn({
        let shared_deque = audio_encoder.shared_deque.clone();
        let control_plane = control_plane.clone();
        let pts_source = pts_source.clone();
        move || {
            audio_capture::capture_audio(shared_deque, control_plane, pid_recv, pts_source);
        }
    });

    control_plane.wait_captured();

    audio_encoder.shared_deque.data.lock().clear();

    let audio_encoder_thread = audio_encoder.start_detached();
    let video_encoder_thread = video_encoder.start_detached();

    let threads = vec![
        ("video_capture", video_capture_thread),
        ("audio_capture", audio_capture_thread),
        ("video_encoder", video_encoder_thread),
        ("audio_encoder", audio_encoder_thread),
        ("writer", writer_thread),
    ];

    threads
        .into_iter()
        .map(|(name, thread)| {
            thread::spawn({
                let control_plane = control_plane.clone();
                move || {
                    let err = thread.join();
                    if let Err(e) = err {
                        println!("Error joining thread {name}: {:?}", e);
                        control_plane.stop();
                    }
                    println!("Thread {name} stopped");
                }
            })
        })
        .for_each(|thread| thread.join().unwrap());

    println!("Encoding complete!");

    Ok(())
}
