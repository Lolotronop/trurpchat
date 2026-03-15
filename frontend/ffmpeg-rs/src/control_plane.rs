use std::sync::Arc;

use parking_lot::{Condvar, Mutex};

#[derive(Debug, PartialEq, Eq)]
pub enum ControlPlaneState {
    Off,
    Starting,
    Captured,
    Streaming,
}

pub struct ControlPlaneData {
    state: Mutex<ControlPlaneState>,
    condvar: Condvar,
}

/// A shared control plane for the capture/encoding process.
/// Created by [`ControlPlaneData::new`].
pub type ControlPlane = Arc<ControlPlaneData>;

impl ControlPlaneData {
    pub fn new() -> ControlPlane {
        let state = Mutex::new(ControlPlaneState::Starting);
        let condvar = Condvar::new();
        Arc::new(ControlPlaneData { state, condvar })
    }

    pub fn set(&self, state: ControlPlaneState) {
        println!("Control: called Set {state:?}");
        let mut lock = self.state.lock();
        if *lock == state {
            return;
        }
        *lock = state;
        drop(lock);
        self.condvar.notify_all();
    }

    pub fn captured(&self) {
        self.set(ControlPlaneState::Captured);
    }

    pub fn streaming(&self) {
        if *self.state.lock() != ControlPlaneState::Captured {
            return;
        }
        self.set(ControlPlaneState::Streaming);
    }

    pub fn stop(&self) {
        self.set(ControlPlaneState::Off);
    }

    /// Waits until the control is in the `Starting` state.
    /// Returns `true` if the caller should proceed with the capture/encoding.
    pub fn wait_captured(&self) {
        let mut lock = self.state.lock();
        self.condvar
            .wait_while(&mut lock, |lock| *lock == ControlPlaneState::Starting);
    }

    pub fn wait_started(&self) -> bool {
        let mut lock = self.state.lock();
        self.condvar.wait_while(&mut lock, |lock| {
            *lock == ControlPlaneState::Starting || *lock == ControlPlaneState::Captured
        });
        println!("Control: started {lock:?}");
        *lock == ControlPlaneState::Streaming
    }

    pub fn should_stop(&self) -> bool {
        let lock = self.state.lock();
        *lock == ControlPlaneState::Off
    }

    pub fn is_off(&self) -> bool {
        let lock = self.state.lock();
        *lock == ControlPlaneState::Off
    }

    pub fn wait_off(&self) {
        let mut lock = self.state.lock();
        self.condvar
            .wait_while(&mut lock, |lock| *lock != ControlPlaneState::Off);
    }
}
