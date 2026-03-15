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
        println!("data.data = [");
        for i in 0..data.data.len() {
            println!("  data[{}] = {:?}", i, data.data[i]);
        }
        println!("]");

        println!("data.linesize = [");
        for i in 0..data.linesize.len() {
            println!("  linesize[{}] = {}", i, data.linesize[i]);
        }
        println!("]");

        println!("data.extended_data = {:?}", data.extended_data);
        println!("data.width = {}", data.width);
        println!("data.height = {}", data.height);
        println!("data.nb_samples = {}", data.nb_samples);
        println!("data.format = {}", data.format);
        println!("data.pict_type = {:?}", data.pict_type);
        println!(
            "data.sample_aspect_ratio = {}/{}",
            data.sample_aspect_ratio.num, data.sample_aspect_ratio.den
        );
        println!("data.pts = {}", data.pts);
        println!("data.pkt_dts = {}", data.pkt_dts);
        println!(
            "data.time_base = {}/{}",
            data.time_base.num, data.time_base.den
        );
        println!("data.quality = {}", data.quality);
        println!("data.opaque = {:?}", data.opaque);
        println!("data.repeat_pict = {}", data.repeat_pict);
        println!("data.sample_rate = {}", data.sample_rate);

        println!("data.buf = [");
        for i in 0..data.buf.len() {
            println!("  buf[{}] = {:?}", i, data.buf[i]);
        }
        println!("]");

        println!("data.extended_buf = {:?}", data.extended_buf);
        println!("data.nb_extended_buf = {}", data.nb_extended_buf);
        println!("data.side_data = {:?}", data.side_data);
        println!("data.nb_side_data = {}", data.nb_side_data);
        println!("data.flags = {}", data.flags);
        println!("data.color_range = {:?}", data.color_range);
        println!("data.color_primaries = {:?}", data.color_primaries);
        println!("data.color_trc = {:?}", data.color_trc);
        println!("data.colorspace = {:?}", data.colorspace);
        println!("data.chroma_location = {:?}", data.chroma_location);
        println!(
            "data.best_effort_timestamp = {}",
            data.best_effort_timestamp
        );
        println!("data.metadata = {:?}", data.metadata);
        println!("data.decode_error_flags = {}", data.decode_error_flags);
        println!("data.opaque_ref = {:?}", data.opaque_ref);
        println!("data.crop_top = {}", data.crop_top);
        println!("data.crop_bottom = {}", data.crop_bottom);
        println!("data.crop_left = {}", data.crop_left);
        println!("data.crop_right = {}", data.crop_right);
        println!("data.private_ref = {:?}", data.private_ref);
        println!("data.duration = {}", data.duration);
    }
}
