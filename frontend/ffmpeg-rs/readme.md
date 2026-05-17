# Windows build instructions

Numbero uno
Get `clang` and `llvm` from releases https://releases.llvm.org/
You need the full ass `clang+llvm-<VERSION>-x86_64-pc-windows-msvc.tar.xz`
Set `LIBCLANG_PATH` to the `/bin` directory of it
Add that bin to `PATH` for good measure

Number dos
Get `ffmpeg` from https://www.gyan.dev/ffmpeg/builds/
You need the full ass `ffmpeg-release-full-shared.7z`, grab the 8.0.1 if possible
Throw the `/bin` path to `PATH`
Also set `FFMPEG_DIR` to the parent containig `/include` and `/lib`

carg go space?
no
`cargo build`
