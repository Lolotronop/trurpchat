@echo off
REM ========================================================
REM generate-icons.cmd
REM Usage: generate-icons.cmd source.png
REM Requires ImageMagick (magick.exe) accessible on PATH
REM ========================================================

if "%~1"=="" (
  echo Usage: %~nx0 source.png
  exit /b 1
)

set "SRC=%~1"
echo Generating icons from %SRC% ...

REM 1. Standard PNG icons
magick "%SRC%" -resize 128x128        128x128.png
magick "%SRC%" -resize 256x256        128x128@2x.png
magick "%SRC%" -resize 32x32          32x32.png

REM 2. Windows Store tile logos
magick "%SRC%" -resize 44x44          Square44x44Logo.png
magick "%SRC%" -resize 30x30          Square30x30Logo.png
magick "%SRC%" -resize 71x71          Square71x71Logo.png
magick "%SRC%" -resize 89x89          Square89x89Logo.png
magick "%SRC%" -resize 107x107        Square107x107Logo.png
magick "%SRC%" -resize 142x142        Square142x142Logo.png
magick "%SRC%" -resize 150x150        Square150x150Logo.png
magick "%SRC%" -resize 284x284        Square284x284Logo.png
magick "%SRC%" -resize 310x310        Square310x310Logo.png

REM 3. Store logo (50x50 recommended by MS, but if unspecified, we’ll use 50x50)
magick "%SRC%" -resize 50x50          StoreLogo.png

REM 4. Single PNG “app” icon
magick "%SRC%" -resize 256x256        icon.png

REM 5. Multi‐resolution ICO
REM    We’ll pack 16x16,32x32,48x48,64x64 & 128x128 into one .ico
magick "%SRC%" -define icon:auto-resize="16,32,48,64,128"  icon.ico

echo Done.
