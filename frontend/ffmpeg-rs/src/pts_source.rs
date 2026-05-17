use parking_lot::Mutex;

pub struct PtsPair {
    pub pts: i64,
    pub last_pts: i64,
}

impl PtsPair {
    pub fn diff(&self) -> i64 {
        self.pts - self.last_pts
    }
}

pub trait PtsSource {
    /// Guaranteed to be monotonically increasing
    /// As a side effect, it should not be called if should_process_video_frame returns false
    fn get_pts(&self) -> i64;
    fn should_process_video_frame(&self) -> bool;
}

pub struct AudioPtsSourceData {
    last_sample_count: i64,
    last_pts: i64,
}

pub struct AudioPtsSource {
    fps: u32,
    sample_rate: u32,
    data: Mutex<AudioPtsSourceData>,
}

impl AudioPtsSource {
    /// Default sample rate is 48000
    pub fn new(fps: u32, sample_rate: u32) -> Self {
        let data = AudioPtsSourceData {
            last_sample_count: 0,
            last_pts: 0,
        };
        Self {
            fps,
            sample_rate,
            data: Mutex::new(data),
        }
    }

    pub fn set_last_sample_count(&self, last_sample_count: i64) {
        let mut data = self.data.lock();
        data.last_sample_count = last_sample_count;
    }

    /// (pts, last_pts)
    pub fn derive_pts(&self, data: &AudioPtsSourceData) -> (i64, i64) {
        let audio_time = data.last_sample_count as f64 / self.sample_rate as f64;
        let pts_frac = audio_time * self.fps as f64;
        let mut pts = pts_frac as i64;

        if pts != 0 && pts <= data.last_pts {
            pts = pts_frac.round() as i64;
        }

        (pts, data.last_pts)
    }
}

impl PtsSource for AudioPtsSource {
    fn get_pts(&self) -> i64 {
        let mut data = self.data.lock();
        let (pts, last_pts) = self.derive_pts(&data);
        let pts = if pts == 0 || pts > last_pts {
            pts
        } else {
            // guarantees monotonically increasing
            last_pts + 1
        };

        data.last_pts = pts;
        pts
    }

    fn should_process_video_frame(&self) -> bool {
        let data = self.data.lock();
        let (pts, last_pts) = self.derive_pts(&data);
        return pts == 0 || pts != last_pts;
    }
}
