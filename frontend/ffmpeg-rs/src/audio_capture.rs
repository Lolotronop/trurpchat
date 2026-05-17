use crate::{
    audio_encoder::{AUDIO_FRAME_SIZE, AUDIO_SAMPLE_RATE, SharedDeque},
    control_plane::ControlPlane,
    pts_source::AudioPtsSource,
};

use std::{
    collections::VecDeque,
    sync::{Arc, mpsc::Receiver},
    time::Instant,
};

use wasapi::*;

pub struct AudioCaptureTarget {
    pub pid: u32,
    pub include: bool,
}

pub fn capture_audio(
    shared_deque: Arc<SharedDeque>,
    control_plane: ControlPlane,
    pid_rec: Receiver<AudioCaptureTarget>,
    pts_source: Arc<AudioPtsSource>,
) {
    let samplerate = AUDIO_SAMPLE_RATE;
    let bits_per_sample = 32;
    let channel_count = 2;
    let desired_format = WaveFormat::new(
        bits_per_sample,
        bits_per_sample,
        &SampleType::Float,
        samplerate as usize,
        channel_count,
        None,
    );

    let autoconvert = true;

    let target = match pid_rec.recv() {
        Ok(target) => target,
        Err(err) => {
            log::error!("Failed to receive PID: {}", err);
            shared_deque.cond.notify_all();
            control_plane.stop();
            return;
        }
    };

    let audio_client_res = AudioClient::new_application_loopback_client(target.pid, target.include);
    let mut audio_client = match audio_client_res {
        Ok(thing) => thing,
        Err(e) => {
            log::error!("Failed to create loopback client: {:?}", e);
            shared_deque.cond.notify_all();
            control_plane.stop();
            return;
        }
    };

    let mode = StreamMode::EventsShared {
        autoconvert,
        buffer_duration_hns: 5_000_000,
    };

    audio_client
        .initialize_client(&desired_format, &Direction::Capture, &mode)
        .expect("Failed to initialize audio client");

    let capture_client = audio_client
        .get_audiocaptureclient()
        .expect("Failed to get audio capture client");
    let event_handle = audio_client
        .set_get_eventhandle()
        .expect("Failed to set event handle");

    audio_client.start_stream().expect("Failed to start stream");

    let _ = event_handle.wait_for_event(200);

    control_plane.wait_captured();

    let mut local_deque = VecDeque::<u8>::new();
    let mut samples_acc = 0;
    log::trace!("Audio capture started: {:?}", Instant::now());
    while !control_plane.should_stop() {
        let res = event_handle.wait_for_event(30);
        if let Some(err) = res.err() {
            log::trace!("Err audio thing handle wait you know: {:?}", err);
            match err {
                wasapi::WasapiError::EventTimeout => {
                    log::trace!("Timeout");
                }
                _ => {
                    log::trace!("Other route");
                    break;
                }
            }
        }

        loop {
            let samples = match capture_client.get_next_packet_size() {
                Ok(Some(f)) => f,
                _ => break,
            };
            if samples == 0 {
                break;
            }
            samples_acc += samples;

            pts_source.set_last_sample_count(samples_acc as i64);

            if let Err(e) = capture_client.read_from_device_to_deque(&mut local_deque) {
                log::error!("Audio read error: {:?}", e);
                break;
            }
        }

        local_deque.make_contiguous();

        {
            let mut deque = shared_deque.data.lock();
            let slice = local_deque.as_slices().0;
            for thing in slice.chunks_exact(4) {
                let float = f32::from_le_bytes([thing[0], thing[1], thing[2], thing[3]]);
                deque.push_back(float);
            }
            if deque.len() >= AUDIO_FRAME_SIZE * 2 {
                shared_deque.cond.notify_all();
            }
        }
        local_deque.clear();
    }
    shared_deque.cond.notify_all();
    let _ = audio_client.stop_stream();
}
