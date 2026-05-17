use std::{
    sync::{Arc, atomic::AtomicI64, mpsc::Sender},
    thread::JoinHandle,
    time::Instant,
};

use crate::{control_plane::ControlPlane, frame_ring::FrameRing};
use ffmpeg::{Dictionary, Rational, codec, encoder, format};
use ffmpeg_next::{self as ffmpeg};

#[derive(Clone)]
pub enum OutputDestination {
    Rtmp(String),
    Srt(String),
}

impl OutputDestination {
    pub fn to_format_path(&self) -> (&str, &str) {
        match self {
            OutputDestination::Rtmp(url) => ("flv", url.as_str()),
            OutputDestination::Srt(url) => ("mpegts", url.as_str()),
        }
    }
}

pub struct VideoEncoderBuilder {
    control_plane: ControlPlane,
    output: Sender<ffmpeg::Packet>,
    frame_ring: Arc<FrameRing>,

    codec: codec::codec::Codec,
    encoder: encoder::Video,
    timebase: Rational,

    output_timebase: Option<Rational>,
    stream_index: Option<usize>,
    audio_pts: Option<Arc<AtomicI64>>,
}

impl VideoEncoderBuilder {
    fn get_opts(settings: EncoderSettings, codec: &codec::codec::Codec) -> Dictionary<'_> {
        let mut opts = Dictionary::new();
        opts.set("profile", "main");

        match codec.name() {
            "libx264" => {
                let preset = match settings.preset {
                    Preset::Fast => "veryfast",
                    Preset::Balanced => "superfast",
                    Preset::Quality => "faster",
                };
                opts.set("preset", preset);
                opts.set("tune", "zerolatency");
                opts.set("x264-params", "bframes=0:scenecut=0:rc-lookahead=0");
                opts.set("nal-hrd", "cbr");
            }
            "h264_nvenc" | "hevc_nvenc" => {
                let preset = match settings.preset {
                    Preset::Fast => "p3",
                    Preset::Balanced => "p5",
                    Preset::Quality => "p7",
                };
                opts.set("preset", preset);
                opts.set("tune", "ll");
                opts.set("rc", "cbr");
                opts.set("zerolatency", "1");
                opts.set("delay", "0");
                opts.set("b_ref_mode", "0");
                opts.set("bf", "0");
                opts.set("rc-lookahead", "0");
            }
            "h264_qsv" => {
                let preset = match settings.preset {
                    Preset::Fast => "veryfast",
                    Preset::Balanced => "medium",
                    Preset::Quality => "slow",
                };
                opts.set("preset", preset);
                opts.set("async_depth", "1");
                opts.set("look_ahead", "0");
                opts.set("b_strategy", "0");
                opts.set("bf", "0");
            }
            "h264_amf" => {
                let quality = match settings.preset {
                    Preset::Fast => "speed",
                    Preset::Balanced => "balanced",
                    Preset::Quality => "quality",
                };
                opts.set("quality", quality);
                opts.set("rc", "cbr");
                opts.set("preanalysis", "0");
                opts.set("bf", "0");
            }
            _ => {}
        }
        opts
    }

    pub fn new(
        settings: EncoderSettings,
        global_header: bool,
        control_plane: ControlPlane,
        output: Sender<ffmpeg::Packet>,
        frame_ring: Arc<FrameRing>,
    ) -> Result<Self, ffmpeg::Error> {
        let codecs = if settings.use_hw_accel {
            vec![
                ffmpeg::encoder::find_by_name("h264_nvenc"),
                ffmpeg::encoder::find_by_name("h264_qsv"),
                ffmpeg::encoder::find_by_name("h264_amf"),
                codec::encoder::find(codec::Id::H264),
            ]
        } else {
            vec![codec::encoder::find(codec::Id::H264)]
        };

        let codecs = codecs.into_iter().flatten().collect::<Vec<_>>();
        if codecs.is_empty() {
            return Err(ffmpeg::Error::EncoderNotFound);
        }

        let timebase = Rational::new(1, settings.fps as i32);
        let format = format::Pixel::NV12;

        let mut encoder: Option<encoder::Video> = None;
        let mut codec: Option<codec::codec::Codec> = None;

        for c in codecs {
            let res = codec::context::Context::new_with_codec(c).encoder().video();
            if res.is_err() {
                continue;
            }
            let mut encoder_ctx = res?;
            encoder_ctx.set_width(settings.width);
            encoder_ctx.set_height(settings.height);
            encoder_ctx.set_format(format);
            encoder_ctx.set_time_base(timebase);
            encoder_ctx.set_frame_rate(Some(Rational::new(settings.fps as i32, 1)));
            encoder_ctx.set_bit_rate(settings.video_bitrate);
            encoder_ctx.set_gop(settings.fps * 2);

            if global_header {
                encoder_ctx.set_flags(codec::Flags::GLOBAL_HEADER);
            };

            let opts = Self::get_opts(settings.clone(), &c);
            match encoder_ctx.open_as_with(c, opts) {
                Err(_) => continue,
                Ok(enc) => encoder = Some(enc),
            }
            codec = Some(c);
            break;
        }

        let (encoder, codec) = match (encoder, codec) {
            (Some(e), Some(c)) => (e, c),
            _ => return Err(ffmpeg::Error::EncoderNotFound),
        };

        log::trace!("Using codec: {:?}", codec.name());

        Ok(VideoEncoderBuilder {
            encoder,
            codec,
            control_plane,
            output,
            timebase,
            frame_ring,
            stream_index: None,
            output_timebase: None,
            audio_pts: None,
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
        log::trace!("Video stream index {}", stream_index);
        self.stream_index = Some(stream_index);
        Ok(stream_index)
    }

    /// Supposed to be called after octx.write_header
    pub fn set_output_timebase(&mut self, octx: &mut format::context::Output) {
        let index = self
            .stream_index
            .expect("To have been called after add_to_output");
        let stream = octx.stream(index).expect("Stream not found");
        let timebase = stream.time_base();
        self.output_timebase = Some(timebase);
    }

    pub fn inherit_audio_pts(&mut self, pts: Arc<AtomicI64>) {
        self.audio_pts = Some(pts);
    }

    pub fn build(self) -> VideoEncoder {
        let output_timebase = self.output_timebase.expect("To have been set");
        let stream_index = self.stream_index.expect("To have been set");
        VideoEncoder {
            output: self.output,
            control_plane: self.control_plane,
            encoder: self.encoder,
            timebase: self.timebase,
            frame_ring: self.frame_ring,
            output_timebase,
            stream_index,
        }
    }
}

pub struct VideoEncoder {
    output: Sender<ffmpeg::Packet>,
    control_plane: ControlPlane,

    pub frame_ring: Arc<FrameRing>,

    encoder: encoder::Video,
    timebase: Rational,
    output_timebase: Rational,
    stream_index: usize,
}

#[derive(Clone)]
pub enum Preset {
    Fast,
    Balanced,
    Quality,
}

#[derive(Clone)]
pub struct EncoderSettings {
    pub destination: OutputDestination,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub audio_bitrate: usize,
    pub video_bitrate: usize,
    pub preset: Preset,
    pub use_hw_accel: bool,
}

impl VideoEncoder {
    pub fn start_detached(mut self) -> JoinHandle<()> {
        std::thread::spawn(move || {
            self.start();
        })
    }

    pub fn start(&mut self) {
        log::trace!("Video encode started: {:?}", Instant::now());
        loop {
            self.frame_ring.wait(self.control_plane.clone());
            if self.control_plane.should_stop() {
                log::trace!("Stopping video encoder thread");
                break;
            }

            let frame = self.frame_ring.front();

            if let Err(err) = self.encoder.send_frame(&frame) {
                log::error!("Failed to send frame: {:?}", err);
                break;
            }

            if let Err(err) = self.receive_packets() {
                log::error!("Failed to receive packets: {:?}", err);
                break;
            }
        }

        if let Err(err) = self.encoder.send_eof() {
            log::error!("Failed to send eof: {:?}", err);
        }
        if let Err(err) = self.receive_packets() {
            log::error!("Failed to receive packets: {:?}", err);
        }

        log::trace!("Repeated frames: {}", self.frame_ring.repeated_frames);
    }

    pub fn receive_packets(&mut self) -> Result<(), ffmpeg::Error> {
        let mut packet = ffmpeg::Packet::empty();

        while self.encoder.receive_packet(&mut packet).is_ok() {
            packet.set_stream(self.stream_index);
            packet.rescale_ts(self.timebase, self.output_timebase);
            if let Err(err) = self.output.send(packet) {
                log::error!("Failed to send packet: {:?}", err);
            }
            packet = ffmpeg::Packet::empty();
        }

        Ok(())
    }
}
