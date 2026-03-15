use std::{
    collections::VecDeque,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicI64, Ordering},
        mpsc::Sender,
    },
    thread::JoinHandle,
    time::Instant,
};

use ffmpeg::{Dictionary, Rational, codec, encoder, format, frame};
use ffmpeg_next as ffmpeg;
use parking_lot::{Condvar, Mutex};

use crate::{control_plane::ControlPlane, video_encoder::EncoderSettings};

pub struct SharedDeque {
    pub data: Mutex<VecDeque<f32>>,
    pub cond: Condvar,
}

impl Default for SharedDeque {
    fn default() -> Self {
        Self {
            data: Mutex::new(VecDeque::new()),
            cond: Condvar::new(),
        }
    }
}

pub const AUDIO_SAMPLE_RATE: u32 = 48000;
pub const AUDIO_FRAME_SIZE: usize = 1024;

pub struct AudioEncoderBuilder {
    control_plane: ControlPlane,
    output: Sender<ffmpeg::Packet>,

    codec: codec::codec::Codec,
    encoder: encoder::Audio,
    format: format::Sample,
    timebase: Rational,

    output_timebase: Option<Rational>,
    stream_index: Option<usize>,
}

impl AudioEncoderBuilder {
    pub fn new(
        settings: EncoderSettings,
        global_header: bool,
        control_plane: ControlPlane,
        output: Sender<ffmpeg::Packet>,
    ) -> Result<Self, ffmpeg::Error> {
        let codec = codec::encoder::find(codec::Id::AAC).expect("AAC codec not found");
        let mut encoder_ctx = codec::context::Context::new_with_codec(codec)
            .encoder()
            .audio()?;

        encoder_ctx.set_rate(AUDIO_SAMPLE_RATE as i32);
        let format = format::Sample::F32(ffmpeg::format::sample::Type::Planar);
        encoder_ctx.set_format(format);
        encoder_ctx.set_channel_layout(ffmpeg::channel_layout::ChannelLayout::STEREO);
        let timebase = Rational::new(1, AUDIO_SAMPLE_RATE as i32);
        encoder_ctx.set_time_base(timebase);
        encoder_ctx.set_bit_rate(settings.audio_bitrate);

        if global_header {
            encoder_ctx.set_flags(codec::Flags::GLOBAL_HEADER);
        }
        let mut opts = Dictionary::new();
        opts.set("aac_coder", "twoloop");

        let encoder = encoder_ctx.open_as_with(codec, opts)?;

        Ok(AudioEncoderBuilder {
            encoder,
            codec,
            format,
            output,
            timebase,
            control_plane,
            stream_index: None,
            output_timebase: None,
        })
    }

    pub fn add_to_output(
        &mut self,
        octx: &mut format::context::Output,
    ) -> Result<usize, ffmpeg::Error> {
        let mut stream = octx.add_stream(self.codec)?;
        stream.set_parameters(&self.encoder);
        stream.set_time_base(self.timebase);
        let stream_index = stream.index();
        println!("Audio stream index {}", stream_index);
        self.stream_index = Some(stream_index);
        Ok(stream_index)
    }

    /// Supposed to be called after octx.write_header
    pub fn set_output_timebase(&mut self, octx: &mut format::context::Output) {
        let timebase = octx.stream(self.stream_index.unwrap()).unwrap().time_base();
        self.output_timebase = Some(timebase);
    }

    pub fn build(self) -> AudioEncoder {
        AudioEncoder {
            frames_encoded: 0,
            last_pts: Arc::new(AtomicI64::new(0)),
            shared_deque: Arc::new(SharedDeque::default()),
            frame: frame::Audio::new(
                self.format,
                AUDIO_FRAME_SIZE,
                ffmpeg::channel_layout::ChannelLayout::STEREO,
            ),
            output: self.output,
            control_plane: self.control_plane,
            encoder: self.encoder,
            timebase: self.timebase,
            output_timebase: self.output_timebase.unwrap(),
            stream_index: self.stream_index.unwrap(),
        }
    }
}

pub struct AudioEncoder {
    output: Sender<ffmpeg::Packet>,
    control_plane: ControlPlane,

    frames_encoded: i64,
    pub last_pts: Arc<AtomicI64>,
    pub shared_deque: Arc<SharedDeque>,
    frame: frame::Audio,

    encoder: encoder::Audio,
    timebase: Rational,
    output_timebase: Rational,
    stream_index: usize,
}

impl AudioEncoder {
    pub fn start_detached(self) -> JoinHandle<()> {
        std::thread::spawn(move || self.start())
    }

    pub fn start(mut self) {
        println!("Audio encoder started: {:?}", Instant::now());
        loop {
            if self.control_plane.should_stop() {
                println!("Audio thread stopped");
                break;
            }
            self.ingest();
        }

        self.encoder.send_eof().unwrap();
        self.recieve_packets();
    }

    pub fn ingest(&mut self) {
        // for bizzare reason, this is the idiomatic solution
        // to a immutable self borrow when doing
        // self.shared_deque.deque.lock()
        let shared_deque = self.shared_deque.clone();
        let mut deque = shared_deque.data.lock();
        while !self.control_plane.should_stop() && deque.len() < AUDIO_FRAME_SIZE * 2 {
            self.shared_deque.cond.wait(&mut deque);
        }

        deque.make_contiguous();

        let frame_size = AUDIO_FRAME_SIZE * 2;

        while deque.len() >= frame_size {
            let slice = &deque.as_slices().0[..frame_size];
            self.encode_frame(slice, self.frames_encoded * AUDIO_FRAME_SIZE as i64)
                .unwrap();

            self.recieve_packets();

            self.frames_encoded += 1;
            deque.drain(..frame_size);
        }

        self.last_pts.store(
            self.frames_encoded * AUDIO_FRAME_SIZE as i64,
            Ordering::Relaxed,
        );
    }

    pub fn recieve_packets(&mut self) {
        let mut packet = ffmpeg::Packet::empty();

        while self.encoder.receive_packet(&mut packet).is_ok() {
            packet.set_stream(self.stream_index);
            packet.rescale_ts(self.timebase, self.output_timebase);
            self.output.send(packet).unwrap();
            packet = ffmpeg::Packet::empty();
        }
    }

    pub fn encode_frame(&mut self, data: &[f32], pts: i64) -> Result<(), ffmpeg::Error> {
        if data.len() != AUDIO_FRAME_SIZE * 2 {
            return Err(ffmpeg::Error::Unknown {});
        }

        self.frame.set_pts(Some(pts));

        let left_ptr = self.frame.data_mut(0).as_mut_ptr() as *mut f32;
        let right_ptr = self.frame.data_mut(1).as_mut_ptr() as *mut f32;

        unsafe {
            let left_slice = std::slice::from_raw_parts_mut(left_ptr, AUDIO_FRAME_SIZE);
            let right_slice = std::slice::from_raw_parts_mut(right_ptr, AUDIO_FRAME_SIZE);

            // Deinterleave: input is [L, R, L, R, ...], output is separate [L, L, ...] and [R, R, ...]
            for (i, data) in data.chunks_exact(2).enumerate() {
                left_slice[i] = data[0];
                right_slice[i] = data[1];
            }
        }

        self.encoder.send_frame(&self.frame)?;

        Ok(())
    }
}
