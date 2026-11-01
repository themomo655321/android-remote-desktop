# Antigravity PC Remote & Screen Mirror for Android

A high-performance remote control and low-latency screen mirroring application designed specifically for **Android Phones** and tablets like the **Advan Sketsa 2**.

---

## ✨ Features

### 📸 Screenshot Hub
* **1-Tap Screenshot Button**: Located in the top header and within the shortcuts tab.
* **Instant High-Res Capture**: Grabs the full native resolution of your Windows display, displays a preview on your phone/tablet with an instant **"⬇️ Save Image"** button.
* **Snipping Tool (`Win+Shift+S`)**: Triggers Windows native Snipping Tool directly from your device.
* **PrintScreen (`PrtScn`)**: Copies the active desktop directly to the Windows clipboard.
* **Shutter feedback**: Real camera click audio and flash feedback upon capture.

### 🖥️ Screen Mirror (View & Direct Touch / Stylus)
* **Real-Time Display**: Streamed over hardware-accelerated WebSockets at 30–60 FPS.
* **Direct Touch**: Tap anywhere on the mirrored screen to click that exact spot on Windows.
* **Advan Sketsa 2 Stylus Pen Support**: Recognizes pen input with pointer events and barrel-button right-click for drawing and note-taking.
* **Pinch-to-Zoom & Pan**: 2-finger pinch allows you to zoom up to 3x into small taskbar icons or text.

### 🖱️ Smart Touchpad (Phone Optimized)
* **Inertial Cursor Drag**: Smooth trackpad navigation with acceleration.
* **Tap-to-Click**: 1-finger tap for Left-Click, 2-finger tap for Right-Click.
* **Scrolling**: 2-finger scroll gesture + dedicated right-side thumb scroll strip.
* **Tactile Buttons**: Dedicated Left Click, Middle Wheel, and Right Click buttons.

### 🎵 Media & Power Controls
* **Master Volume**: Volume slider, Volume Up/Down, and Mute.
* **Media Playback**: Play/Pause, Next Track, Previous Track.
* **Windows Window Navigation**: Show Desktop (`Win+D`), Task View (`Win+Tab`), Alt+Tab app switcher, and Virtual Desktop switcher (`Win+Ctrl+Left/Right`).
* **Power Controls**: Lock Workstation (`Win+L`), Minimize All.

### ⌨️ Keyboard & Clipboard Sync
* **Unicode Typing**: Type messages, emojis, or speech-to-text from your Android keyboard and send them straight to your laptop.
* **Clipboard Sync**: Push text directly from your phone into the Windows clipboard.
* **Special Keys**: Esc, Tab, Win, Ctrl, Alt, Shift, Delete, Backspace, Enter, and Arrow navigation keys.

---

## 🚀 Quick Start (Running on Laptop)

### 1. Launch the Server
Simply double-click `start_server.bat` in this folder, or run in terminal:
```powershell
python host\server.py
```

You will see:
```text
================================================================
  ANTIGRAVITY REMOTE DESKTOP & CONTROLLER FOR ANDROID
================================================================
  Laptop IP:      192.168.1.21
  Port:           5000

  Open this link on your Android Phone or Advan Sketsa 2:
  ==> http://192.168.1.21:5000
================================================================
```

---

## 📱 Connecting Your Android Phone or Advan Sketsa 2

### Method 1: Instant PWA App (Recommended - Zero Installation Needed)
1. Make sure your phone/tablet is connected to the **same Wi-Fi network** as your laptop.
2. Open Chrome (or any browser) on your phone or Advan Sketsa 2.
3. Go to: **`http://192.168.1.21:5000`** (replace with your laptop's IP if different).
4. Tap the browser menu (⋮) and select **"Add to Home Screen"** or **"Install App"**.
5. It will install as a native fullscreen app with its own icon on your home screen, with zero browser address bars!

### Method 2: Native Android Studio App
If you prefer building a standalone `.apk`:
* Open the `android_client/` folder in Android Studio.
* Click **Run** or **Build APK**.
* The app provides an IP prompt to connect directly to your laptop host.

---

## 🛠️ Architecture

* **Host**: Python 3 + Windows native GDI / GDI+ hardware image encoding (10ms frame capture), Win32 `SendInput`, `Starlette` ASGI & `Uvicorn` WebSockets. Zero external pip dependencies required.
* **Client**: HTML5 Pointer Events (supports Touch, Mouse, and Advan Sketsa Stylus Pen), Hardware Canvas ImageBitmap decoder, Web Audio feedback, and PWA Service Shell.
