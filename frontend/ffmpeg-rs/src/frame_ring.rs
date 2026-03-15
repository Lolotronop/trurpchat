use ffmpeg_next::{format, frame};
use parking_lot::{Condvar, Mutex};
use std::{cell::UnsafeCell, time::Duration};

use crate::control_plane;

struct Indicies {
    reader: usize,
    writer: usize,
}

impl Default for Indicies {
    fn default() -> Self {
        Self {
            reader: 0,
            writer: 0,
        }
    }
}

pub struct FrameRing {
    bufs: Vec<UnsafeCell<*mut frame::Video>>,
    // reader, writer
    idx: Mutex<Indicies>,
    cond: Condvar,
    capacity: usize,
    fps: u32,

    pub repeated_frames: usize,
}

unsafe impl Send for FrameRing {}
unsafe impl Sync for FrameRing {}

impl FrameRing {
    pub fn new(capacity: usize, format: format::Pixel, width: u32, height: u32, fps: u32) -> Self {
        let mut vec = Vec::with_capacity(capacity);
        for _ in 0..capacity {
            let frame = frame::Video::new(format, width, height);
            vec.push(UnsafeCell::new(Box::into_raw(Box::new(frame))));
        }
        Self {
            bufs: vec,
            idx: Mutex::new(Indicies::default()),
            cond: Condvar::new(),
            repeated_frames: 0,
            capacity,
            fps,
        }
    }

    pub fn last_pts(&self) -> i64 {
        let idx = self.idx.lock();
        let frame = self.get_mut(idx.writer.saturating_sub(1));
        drop(idx);
        if let Some(pts) = frame.pts() { pts } else { -1 }
    }

    pub fn wait(&self, control_plane: control_plane::ControlPlane) {
        let mut lock = self.idx.lock();
        let res = self.cond.wait_while_for(
            &mut lock,
            |idx| !control_plane.should_stop() && idx.reader + 1 >= idx.writer,
            Duration::from_secs(1) / 4,
        );

        if res.timed_out() {
            // TODO: switch to a audio-based PtsSource
            // even in here. should be shared with video encoder
            let frame = self.get_mut(lock.reader);
            if let Some(pts) = frame.pts() {
                frame.set_pts(Some(pts + (self.fps / 4) as i64));
            }
        }
    }

    pub fn front(&self) -> &mut frame::Video {
        let mut idx = self.idx.lock();

        let next_buf_idx = (idx.reader + 1) % self.capacity;
        let writer = idx.writer % self.capacity;

        if next_buf_idx != writer {
            idx.reader += 1;
        }

        self.get_mut(idx.reader)
    }

    pub fn back(&self) -> &mut frame::Video {
        let idx = self.idx.lock();
        self.get_mut(idx.writer)
    }

    pub fn ack_wrote(&self) {
        let mut idx = self.idx.lock();

        let next_buf_idx = (idx.writer + 1) % self.capacity;
        let reader_buf_idx = idx.reader % self.capacity;

        if next_buf_idx != reader_buf_idx {
            idx.writer += 1;
        } else {
            println!("Can't advance writer {} {}", idx.writer, idx.reader);
        }

        drop(idx);

        self.cond.notify_all();
    }

    pub fn get_mut(&self, index: usize) -> &mut frame::Video {
        return unsafe { &mut *(*self.bufs[index % self.capacity].get()) };
    }
}

impl Drop for FrameRing {
    fn drop(&mut self) {
        unsafe {
            for i in 0..self.capacity {
                drop(Box::from_raw(*self.bufs[i].get()));
            }
        }
    }
}
