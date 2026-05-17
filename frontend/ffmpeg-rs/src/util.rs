fn current_process_rss_bytes() -> Option<u64> {
    unsafe {
        let handle: windows::Win32::Foundation::HANDLE =
            windows::Win32::System::Threading::GetCurrentProcess();
        let mut counters =
            windows::Win32::System::ProcessStatus::PROCESS_MEMORY_COUNTERS::default();
        let cb = size_of::<windows::Win32::System::ProcessStatus::PROCESS_MEMORY_COUNTERS>() as u32;
        let ok = windows::Win32::System::ProcessStatus::K32GetProcessMemoryInfo(
            handle,
            &mut counters,
            cb,
        );
        if ok.as_bool() {
            Some(counters.WorkingSetSize as u64)
        } else {
            None
        }
    }
}

pub fn print_full_avframe(frame: Video) {
    unsafe {
        let data = *frame.as_mut_ptr();
        log::trace!("data.data = [");
        for i in 0..data.data.len() {
            log::trace!("  data[{}] = {:?}", i, data.data[i]);
        }
        log::trace!("]");

        log::trace!("data.linesize = [");
        for i in 0..data.linesize.len() {
            log::trace!("  linesize[{}] = {}", i, data.linesize[i]);
        }
        log::trace!("]");

        log::trace!("data.extended_data = {:?}", data.extended_data);
        log::trace!("data.width = {}", data.width);
        log::trace!("data.height = {}", data.height);
        log::trace!("data.nb_samples = {}", data.nb_samples);
        log::trace!("data.format = {}", data.format);
        log::trace!("data.pict_type = {:?}", data.pict_type);
        log::trace!(
            "data.sample_aspect_ratio = {}/{}",
            data.sample_aspect_ratio.num, data.sample_aspect_ratio.den
        );
        log::trace!("data.pts = {}", data.pts);
        log::trace!("data.pkt_dts = {}", data.pkt_dts);
        log::trace!(
            "data.time_base = {}/{}",
            data.time_base.num, data.time_base.den
        );
        log::trace!("data.quality = {}", data.quality);
        log::trace!("data.opaque = {:?}", data.opaque);
        log::trace!("data.repeat_pict = {}", data.repeat_pict);
        log::trace!("data.sample_rate = {}", data.sample_rate);

        log::trace!("data.buf = [");
        for i in 0..data.buf.len() {
            log::trace!("  buf[{}] = {:?}", i, data.buf[i]);
        }
        log::trace!("]");

        log::trace!("data.extended_buf = {:?}", data.extended_buf);
        log::trace!("data.nb_extended_buf = {}", data.nb_extended_buf);
        log::trace!("data.side_data = {:?}", data.side_data);
        log::trace!("data.nb_side_data = {}", data.nb_side_data);
        log::trace!("data.flags = {}", data.flags);
        log::trace!("data.color_range = {:?}", data.color_range);
        log::trace!("data.color_primaries = {:?}", data.color_primaries);
        log::trace!("data.color_trc = {:?}", data.color_trc);
        log::trace!("data.colorspace = {:?}", data.colorspace);
        log::trace!("data.chroma_location = {:?}", data.chroma_location);
        log::trace!(
            "data.best_effort_timestamp = {}",
            data.best_effort_timestamp
        );
        log::trace!("data.metadata = {:?}", data.metadata);
        log::trace!("data.decode_error_flags = {}", data.decode_error_flags);
        log::trace!("data.opaque_ref = {:?}", data.opaque_ref);
        log::trace!("data.crop_top = {}", data.crop_top);
        log::trace!("data.crop_bottom = {}", data.crop_bottom);
        log::trace!("data.crop_left = {}", data.crop_left);
        log::trace!("data.crop_right = {}", data.crop_right);
        log::trace!("data.private_ref = {:?}", data.private_ref);
        log::trace!("data.duration = {}", data.duration);
    }
}
