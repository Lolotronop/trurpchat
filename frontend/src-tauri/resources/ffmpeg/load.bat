@echo off
setlocal enabledelayedexpansion

:: Config
set "URL=https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-full-shared.7z"
set "ARCHIVE=%~dp0ffmpeg-release-full-shared.7z"
set "TMPDIR=%~dp0ffmpeg_tmp_extract"
set "SEVENZIP=7z.exe"

:: Download with PowerShell (shows progress)
echo Downloading %URL% to "%ARCHIVE%" ...
powershell -NoProfile -Command ^
  "Try { Invoke-WebRequest -Uri '%URL%' -OutFile '%ARCHIVE%' -UseBasicParsing -Verbose } Catch { Write-Error 'Download failed'; exit 1 }"
if errorlevel 1 (
  echo Download failed.
  exit /b 1
)

:: Ensure tmp dir
if exist "%TMPDIR%" rd /s /q "%TMPDIR%"
mkdir "%TMPDIR%"

:: Extract using 7z (assumes 7z.exe is in PATH or same folder as script)
echo Extracting archive...
"%SEVENZIP%" x "%ARCHIVE%" -o"%TMPDIR%" -y >nul
if errorlevel 1 (
  echo Extraction failed. Make sure %SEVENZIP% is available.
  rd /s /q "%TMPDIR%"
  exit /b 1
)

:: Find bin folder inside extracted tree and move .dll files to script directory
echo Locating bin folders and moving .dll files...
set "MOVED=0"
for /f "delims=" %%D in ('dir "%TMPDIR%\*bin" /b /s 2^>nul') do (
  if exist "%%D\*.dll" (
    echo Moving DLLs from "%%D"...
    move /y "%%D\*.dll" "%~dp0" >nul
    set "MOVED=1"
  )
)

:: If not found, try common path pattern (e.g., ffmpeg-*-release\bin)
if "%MOVED%"=="0" (
  for /f "delims=" %%F in ('dir "%TMPDIR%\*ffmpeg*\bin" /b /s 2^>nul') do (
    if exist "%%F\*.dll" (
      echo Moving DLLs from "%%F"...
      move /y "%%F\*.dll" "%~dp0" >nul
      set "MOVED=1"
    )
  )
)

if "%MOVED%"=="0" (
  echo No .dll files found in extracted bin folders.
) else (
  echo DLL files moved to "%~dp0".
)

:: Cleanup
echo Cleaning up...
del /f /q "%ARCHIVE%" 2>nul
rd /s /q "%TMPDIR%" 2>nul

echo Done.
endlocal
