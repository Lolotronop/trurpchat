use crate::{
    audio_capture::AudioCaptureTarget,
    audio_encoder::AUDIO_SAMPLE_RATE,
    control_plane::{ControlPlane, ControlPlaneState},
    frame_ring::FrameRing,
    scaler_shaders::{self, calculate_viewport},
    video_encoder::EncoderSettings,
};

use std::{
    sync::{
        Arc,
        atomic::{AtomicI64, Ordering},
        mpsc::Sender,
    },
    time::{Duration, Instant},
};

use ffmpeg_next::{ffi::av_buffer_create, format::Pixel};
use windows::{
    self,
    Wdk::System::Threading::{NtQueryInformationProcess, ProcessBasicInformation},
    Win32::{
        Foundation::{CloseHandle, HANDLE},
        Graphics::{
            Direct3D11::{
                D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE, D3D11_COMPARISON_NEVER,
                D3D11_CPU_ACCESS_READ, D3D11_CPU_ACCESS_WRITE, D3D11_FILTER_MIN_MAG_MIP_LINEAR,
                D3D11_MAP_READ_WRITE, D3D11_MAPPED_SUBRESOURCE, D3D11_SAMPLER_DESC,
                D3D11_TEXTURE_ADDRESS_CLAMP, D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT,
                D3D11_USAGE_STAGING, ID3D11RenderTargetView, ID3D11SamplerState,
                ID3D11ShaderResourceView, ID3D11Texture2D,
            },
            Dxgi::Common::{DXGI_FORMAT, DXGI_FORMAT_R8G8B8A8_UNORM, DXGI_SAMPLE_DESC},
        },
        System::{
            Diagnostics::{
                Debug::ReadProcessMemory,
                ToolHelp::{
                    CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
                    TH32CS_SNAPPROCESS,
                },
            },
            Threading::{
                OpenProcess, PEB, PROCESS_BASIC_INFORMATION, PROCESS_QUERY_INFORMATION,
                PROCESS_VM_READ, RTL_USER_PROCESS_PARAMETERS,
            },
        },
        UI::WindowsAndMessaging::{FindWindowW, GetWindowThreadProcessId},
    },
    core::{HSTRING, Interface},
};
use windows_capture::{
    capture::{Context, GraphicsCaptureApiHandler},
    frame::Frame,
    graphics_capture_api::{GraphicsCaptureApi, InternalCaptureControl},
    graphics_capture_picker::PickedGraphicsCaptureItem,
    monitor::Monitor,
    settings::{
        ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
        GraphicsCaptureItemType, MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
    },
    window::Window,
};

pub struct HandlerFlags {
    pub control_plane: ControlPlane,
    pub settings: EncoderSettings,
    pub frame_ring: Arc<FrameRing>,
    pub pid_send: Sender<AudioCaptureTarget>,
    pub last_sample_count: Arc<AtomicI64>,
}

struct Capture {
    flags: HandlerFlags,
    cpu_texture: Option<ID3D11Texture2D>,
    render_texture: Option<ID3D11Texture2D>,
    mapped_resource: D3D11_MAPPED_SUBRESOURCE,
    format_scaler: ffmpeg_next::software::scaling::Context,
    video_frame: ffmpeg_next::frame::Video,
    captured: usize,
    start: Instant,
}

unsafe impl Send for Capture {}
unsafe impl Sync for Capture {}

impl Capture {
    fn cleanup(&mut self) {
        unsafe {
            (*self.video_frame.as_mut_ptr()).buf[0] = std::ptr::null_mut();
            (*self.video_frame.as_mut_ptr()).data[0] = std::ptr::null_mut();
            (*self.video_frame.as_mut_ptr()).linesize[0] = 0;
        }

        // if let Some(tex) = self.cpu_texture.as_ref() {
        //     unsafe {
        //         context.Unmap(tex, 0);
        //     }
        // }

        let micros = self.start.elapsed().as_micros() as f32;
        let fpm = self.captured as f32 / micros;
        let fps = fpm * 1000000.0;
        println!("Captured frames: {} ", self.captured);
        println!("Effective FPS: {} ", fps);
        self.flags.frame_ring.ack_wrote();
    }
}

impl GraphicsCaptureApiHandler for Capture {
    type Flags = HandlerFlags;
    type Error = Box<dyn std::error::Error + Send + Sync>;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        let width = ctx.flags.settings.width;
        let height = ctx.flags.settings.height;
        let format_scaler = ffmpeg_next::software::scaling::Context::get(
            Pixel::RGBA,
            width,
            height,
            Pixel::NV12,
            width,
            height,
            ffmpeg_next::software::scaling::Flags::FAST_BILINEAR,
        )?;

        Ok(Self {
            flags: ctx.flags,
            cpu_texture: None,
            render_texture: None,
            mapped_resource: D3D11_MAPPED_SUBRESOURCE::default(),
            format_scaler,
            video_frame: ffmpeg_next::frame::Video::new(Pixel::RGBA, width, height),
            captured: 0,
            start: Instant::now(),
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        capture_control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        let start = Instant::now();
        let device = frame.device();
        let context = frame.device_context();
        let width = self.flags.settings.width;
        let height = self.flags.settings.height;

        if self.captured == 0 {
            self.start = Instant::now();
            let res = scaler_shaders::setup_shaders(device, context);
            if res.is_err() {
                println!("Failed to setup shaders {:?}", res);
                self.cleanup();
                capture_control.stop();
                self.flags.frame_ring.ack_wrote();
                return Ok(());
            }

            // Texture Settings
            let cpu_texture_desc = D3D11_TEXTURE2D_DESC {
                Width: width,
                Height: height,
                MipLevels: 1,
                ArraySize: 1,
                Format: DXGI_FORMAT(frame.color_format() as i32),
                SampleDesc: DXGI_SAMPLE_DESC {
                    Count: 1,
                    Quality: 0,
                },
                Usage: D3D11_USAGE_STAGING,
                BindFlags: 0,
                CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32 | D3D11_CPU_ACCESS_WRITE.0 as u32,
                MiscFlags: 0,
            };

            let render_texture_desc = D3D11_TEXTURE2D_DESC {
                Width: width,
                Height: height,
                MipLevels: 1,
                ArraySize: 1,
                Format: DXGI_FORMAT_R8G8B8A8_UNORM,
                SampleDesc: DXGI_SAMPLE_DESC {
                    Count: 1,
                    Quality: 0,
                },
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: D3D11_BIND_RENDER_TARGET.0 as u32 | D3D11_BIND_SHADER_RESOURCE.0 as u32,
                CPUAccessFlags: 0,
                MiscFlags: 0,
            };

            unsafe {
                device.CreateTexture2D(&cpu_texture_desc, None, Some(&mut self.cpu_texture))?;
                device.CreateTexture2D(
                    &render_texture_desc,
                    None,
                    Some(&mut self.render_texture),
                )?;

                let texture = self.cpu_texture.as_ref().unwrap();
                context.Map(
                    texture,
                    0,
                    D3D11_MAP_READ_WRITE,
                    0,
                    Some(&mut self.mapped_resource),
                )?;

                // Create a video frame
                // this needs to be done every frame
                // because the buffer is invalidated every time
                let buf = av_buffer_create(
                    self.mapped_resource.pData.cast::<u8>(),
                    (frame.height() * self.mapped_resource.RowPitch) as usize,
                    None,
                    context.as_raw(),
                    0,
                );
                (*self.video_frame.as_mut_ptr()).buf[0] = buf;
                (*self.video_frame.as_mut_ptr()).data[0] = self.mapped_resource.pData.cast::<u8>();
                (*self.video_frame.as_mut_ptr()).linesize[0] = self.mapped_resource.RowPitch as i32;
            }
        }

        if self.flags.control_plane.should_stop() {
            if let Some(tex) = self.cpu_texture.as_ref() {
                unsafe {
                    context.Unmap(tex, 0);
                }
            }

            self.cleanup();

            capture_control.stop();
            return Ok(());
        }

        let last_sample = self.flags.last_sample_count.load(Ordering::Relaxed);

        let audio_time = last_sample as f64 / AUDIO_SAMPLE_RATE as f64;
        let pts_frac = audio_time * self.flags.settings.fps as f64;
        let mut pts = pts_frac as i64;

        let last_pts = self.flags.frame_ring.last_pts();

        if pts != 0 && pts == last_pts {
            pts = pts_frac.round() as i64;
        }

        if pts != 0 && pts <= last_pts {
            // println!("Didcard: l {} c {}", last_pts, pts_frac,);
            return Ok(());
        }

        if pts - last_pts >= 2 {
            println!("Skipped: {}", pts - last_pts,);
        }

        // self.flags.start.notify();
        // self.captured += 1;
        // return Ok(());

        if width == frame.width() && height == frame.height() {
            unsafe {
                let cpu_tex = self.cpu_texture.as_ref().unwrap();
                context.CopyResource(cpu_tex, frame.as_raw_texture());
            }
        } else {
            let mut srv: Option<ID3D11ShaderResourceView> = None;
            unsafe {
                device.CreateShaderResourceView(frame.as_raw_texture(), None, Some(&mut srv))?;
            }
            let srv = srv.unwrap();

            let viewport = calculate_viewport(
                frame.width(),
                frame.height(),
                self.flags.settings.width,
                self.flags.settings.height,
            );

            let mut sampler: Option<ID3D11SamplerState> = None;
            let sampler_desc = D3D11_SAMPLER_DESC {
                Filter: D3D11_FILTER_MIN_MAG_MIP_LINEAR,
                AddressU: D3D11_TEXTURE_ADDRESS_CLAMP,
                AddressV: D3D11_TEXTURE_ADDRESS_CLAMP,
                AddressW: D3D11_TEXTURE_ADDRESS_CLAMP,
                MipLODBias: 0.0,
                MaxAnisotropy: 1,
                ComparisonFunc: D3D11_COMPARISON_NEVER,
                BorderColor: [0.0; 4],
                MinLOD: 0.0,
                MaxLOD: f32::MAX,
            };
            unsafe {
                device.CreateSamplerState(&sampler_desc, Some(&mut sampler))?;
            }
            let texture = self.render_texture.as_ref().unwrap();
            let mut rtv: Option<ID3D11RenderTargetView> = None;
            unsafe {
                device.CreateRenderTargetView(texture, None, Some(&mut rtv))?;
                let rtv = rtv.unwrap();

                context.ClearRenderTargetView(&rtv, &[0.0, 0.0, 0.0, 1.0]);
                context.OMSetRenderTargets(Some(&[Some(rtv)]), None);
                context.RSSetViewports(Some(&[viewport]));
                context.PSSetShaderResources(0, Some(&[Some(srv)]));
                context.PSSetSamplers(0, Some(&[sampler]));
                context.Draw(6, 0);

                let cpu_tex = self.cpu_texture.as_ref().unwrap();
                context.CopyResource(cpu_tex, texture);
            }
        }

        let frame_buffer = &mut self.flags.frame_ring;
        let back = frame_buffer.back();
        let scaler_start = Instant::now();
        let res = self.format_scaler.run(&self.video_frame, back);
        let scaler_dur = scaler_start.elapsed();

        back.set_pts(Some(pts));
        self.flags.frame_ring.ack_wrote();

        if res.is_err() {
            println!("Error scaling video frame: {:?}", res);
            return Ok(());
        }

        if self.captured == 0 {
            self.flags.control_plane.captured();
        }

        self.captured += 1;
        if start.elapsed() > Duration::from_micros(10_000) {
            println!("FULL: {:?} | s: {:?}", start.elapsed(), scaler_dur);
        }
        Ok(())
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        println!("Capture session ended");
        self.cleanup();
        Ok(())
    }
}

fn get_process_id_from_window_name(window_name: &HSTRING) -> windows::core::Result<u32> {
    unsafe {
        // Find the window handle by its display name
        // First parameter is class name (None if you don't know it)
        let hwnd = FindWindowW(None, window_name)?;

        // Get the process ID from the window handle
        let mut process_id: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));

        Ok(process_id)
    }
}

// TODO: move to main trurpchat app, recieve pid as a param
fn find_webview2_audio_service_pid() -> windows::core::Result<Option<u32>> {
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)?;

        let mut process_entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };

        let mut matched_pid = None;

        if Process32FirstW(snapshot, &mut process_entry).is_ok() {
            loop {
                let pid = process_entry.th32ProcessID;

                if let Ok(handle) =
                    OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid)
                {
                    if let Ok(cmdline) = get_process_command_line(handle) {
                        if cmdline.contains("msedgewebview2.exe")
                            && cmdline.contains("=audio")
                            && cmdline.contains("trurpchat")
                        {
                            matched_pid = Some(pid);
                        }
                    }
                    let _ = CloseHandle(handle);
                }

                if Process32NextW(snapshot, &mut process_entry).is_err() {
                    break;
                }
            }
        }

        let _ = CloseHandle(snapshot);
        Ok(matched_pid)
    }
}
unsafe fn get_process_command_line(process_handle: HANDLE) -> windows::core::Result<String> {
    unsafe {
        let mut pbi: PROCESS_BASIC_INFORMATION = std::mem::zeroed();
        let mut return_length = 0u32;

        let _ = NtQueryInformationProcess(
            process_handle,
            ProcessBasicInformation,
            &mut pbi as *mut _ as *mut _,
            std::mem::size_of::<PROCESS_BASIC_INFORMATION>() as u32,
            &mut return_length,
        );

        let mut peb: PEB = std::mem::zeroed();
        let mut read = 0;
        ReadProcessMemory(
            process_handle,
            pbi.PebBaseAddress as *const _,
            &mut peb as *mut _ as *mut _,
            std::mem::size_of::<PEB>(),
            Some(&mut read),
        )?;

        let mut params: RTL_USER_PROCESS_PARAMETERS = std::mem::zeroed();
        ReadProcessMemory(
            process_handle,
            peb.ProcessParameters as *const _,
            &mut params as *mut _ as *mut _,
            std::mem::size_of::<RTL_USER_PROCESS_PARAMETERS>(),
            Some(&mut read),
        )?;

        let cmd_line_length = params.CommandLine.Length as usize / 2;
        let mut cmd_line_buffer = vec![0u16; cmd_line_length + 1];

        ReadProcessMemory(
            process_handle,
            params.CommandLine.Buffer.0 as *const _,
            cmd_line_buffer.as_mut_ptr() as *mut _,
            params.CommandLine.Length as usize,
            Some(&mut read),
        )?;

        Ok(String::from_utf16_lossy(&cmd_line_buffer))
    }
}

pub fn monitor_from_name(name: &str) -> Option<Monitor> {
    let digit = name.chars().last().and_then(|c| c.to_digit(10));
    digit.and_then(|d| Monitor::from_index(d as usize - 1).ok())
}

enum CaptureItem {
    Window(Window),
    Monitor(Monitor),
    Picked(PickedGraphicsCaptureItem),
}

impl TryInto<GraphicsCaptureItemType> for CaptureItem {
    type Error = Box<dyn std::error::Error + Send + Sync>;

    fn try_into(self) -> Result<GraphicsCaptureItemType, Self::Error> {
        match self {
            CaptureItem::Window(window) => Ok(window.try_into().unwrap()),
            CaptureItem::Monitor(monitor) => Ok(monitor.try_into().unwrap()),
            CaptureItem::Picked(picked) => Ok(picked.try_into().unwrap()),
        }
    }
}

pub fn capture(flags: HandlerFlags) {
    let target = match windows_capture::graphics_capture_picker::GraphicsCapturePicker::pick_item()
    {
        Ok(Some(t)) => t,
        Ok(None) => {
            println!("No target selected");
            flags.control_plane.stop();
            drop(flags);
            return;
        }
        Err(e) => {
            println!("Error picking item: {}", e);
            flags.control_plane.stop();
            drop(flags);
            return;
        }
    };

    let name = target.item.DisplayName().unwrap();
    let audio_target = if let Ok(pid) = get_process_id_from_window_name(&name) {
        AudioCaptureTarget { pid, include: true }
    } else if let Ok(Some(pid)) = find_webview2_audio_service_pid() {
        AudioCaptureTarget {
            pid,
            include: false,
        }
    } else {
        println!("Could not get PID, using self");
        AudioCaptureTarget {
            pid: std::process::id(),
            include: false,
        }
    };

    flags.pid_send.send(audio_target).unwrap();

    // the library panics if you set a non-default value and the API isn't supported
    // so I have to check manually first
    let border_setting = if let Ok(true) = GraphicsCaptureApi::is_border_settings_supported() {
        DrawBorderSettings::WithoutBorder
    } else {
        DrawBorderSettings::Default
    };

    let mininterval = if let Ok(true) = GraphicsCaptureApi::is_minimum_update_interval_supported() {
        MinimumUpdateIntervalSettings::Custom(Duration::from_secs(1) / 240)
    } else {
        MinimumUpdateIntervalSettings::Default
    };

    // Ideally, we would want to use only the last branch
    // but there is a bug in the windows_capture crate -
    // on windows 10 that causes a crash
    // see: https://github.com/NiiightmareXD/windows-capture/issues/187
    let name = name.to_string();
    let item: CaptureItem = if let Ok(window) = Window::from_contains_name(&name) {
        CaptureItem::Window(window)
    } else if let Some(monitor) = monitor_from_name(&name) {
        CaptureItem::Monitor(monitor)
    } else if let Some(monitor) = Monitor::primary().ok() {
        // fallback to primary monitor if nothing else works
        CaptureItem::Monitor(monitor)
    } else {
        // this should never happen, but just in case
        println!("Using picked item directly, even primary monitor failed");
        CaptureItem::Picked(target)
    };

    Capture::start(Settings::new(
        item,
        CursorCaptureSettings::Default,
        border_setting,
        SecondaryWindowSettings::Default,
        mininterval,
        DirtyRegionSettings::Default,
        ColorFormat::Rgba8,
        flags,
    ))
    .expect("Screen capture failed");
}
