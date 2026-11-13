"""
Antigravity Remote Desktop & Controller - Host Server
Combines high-performance screen capture, Windows input injection,
multi-monitor streaming, real-time typing, brightness control, and drag-lock.
"""

import os
import sys
import json
import time
import asyncio
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR.parent))

from starlette.applications import Starlette
from starlette.responses import JSONResponse, Response, FileResponse
from starlette.routing import Route, WebSocketRoute, Mount
from starlette.staticfiles import StaticFiles
from starlette.websockets import WebSocket, WebSocketDisconnect
import uvicorn
import socket

from host.screen_capture import ScreenCapturer
from host.input_controller import InputController
from host.system_info import SystemManager

screen_capturer = ScreenCapturer()
input_controller = InputController()
local_ip = SystemManager.get_local_ip()
HOSTNAME = socket.gethostname()
PORT = 5000
CURRENT_VERSION = "1.1.0"

STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)


async def api_status(request):
    """Returns system status, active monitors, battery, brightness, and computer name."""
    monitors = screen_capturer.get_monitors()
    active_rect = screen_capturer.get_active_monitor_rect()
    battery = SystemManager.get_battery_info()
    clipboard = SystemManager.get_clipboard_text()
    brightness = input_controller.get_brightness()
    return JSONResponse({
        "status": "online",
        "version": CURRENT_VERSION,
        "name": HOSTNAME,
        "ip": local_ip,
        "port": PORT,
        "monitors": monitors,
        "active_monitor": screen_capturer.active_monitor_index,
        "screen": {"width": active_rect["width"], "height": active_rect["height"]},
        "battery": battery,
        "brightness": brightness,
        "clipboard": clipboard
    })


async def api_screenshot(request):
    """Captures and returns a full-resolution JPEG screenshot of the selected monitor."""
    monitor_param = request.query_params.get("monitor")
    mon_idx = int(monitor_param) if monitor_param is not None else screen_capturer.active_monitor_index
    jpeg_bytes, w, h = screen_capturer.capture_full_screenshot(quality=90, monitor_index=mon_idx)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    headers = {
        "Content-Disposition": f'inline; filename="screenshot_{timestamp}.jpg"',
        "X-Screen-Width": str(w),
        "X-Screen-Height": str(h)
    }
    return Response(content=jpeg_bytes, media_type="image/jpeg", headers=headers)


async def api_clipboard(request):
    """Get or set clipboard text."""
    if request.method == "POST":
        try:
            body = await request.json()
            text = body.get("text", "")
            success = SystemManager.set_clipboard_text(text)
            return JSONResponse({"success": success})
        except Exception as e:
            return JSONResponse({"success": False, "error": str(e)}, status_code=400)
    else:
        text = SystemManager.get_clipboard_text()
        return JSONResponse({"text": text})


async def api_check_update(request):
    """Checks GitHub for the latest release version."""
    import urllib.request
    try:
        url = "https://api.github.com/repos/themomo655321/android-remote-desktop/releases/latest"
        req = urllib.request.Request(url, headers={"User-Agent": "PCRemote-Host"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            latest_tag = data.get("tag_name", "").replace("v", "").strip()
            
            apk_url = f"https://github.com/themomo655321/android-remote-desktop/releases/download/{data.get('tag_name')}/PCRemote.apk"
            for asset in data.get("assets", []):
                if asset.get("name", "").endswith(".apk"):
                    apk_url = asset.get("browser_download_url")
                    break

            has_update = latest_tag != CURRENT_VERSION and bool(latest_tag)
            return JSONResponse({
                "current_version": CURRENT_VERSION,
                "latest_version": latest_tag,
                "has_update": has_update,
                "download_url": apk_url,
                "notes": data.get("body", "")
            })
    except Exception as e:
        return JSONResponse({
            "current_version": CURRENT_VERSION,
            "error": str(e),
            "has_update": False
        })


async def api_download_apk(request):
    """Direct LAN download of the compiled Android APK."""
    apk_path = BASE_DIR.parent / "PCRemote.apk"
    if apk_path.exists():
        return FileResponse(
            path=str(apk_path),
            media_type="application/vnd.android.package-archive",
            filename="PCRemote.apk"
        )
    return JSONResponse({"error": "APK not found"}, status_code=404)


async def ws_endpoint(websocket: WebSocket):
    """Main bidirectional control and video streaming endpoint."""
    await websocket.accept()
    
    monitors = screen_capturer.get_monitors()
    active_rect = screen_capturer.get_active_monitor_rect()
    battery = SystemManager.get_battery_info()
    brightness = input_controller.get_brightness()
    
    # Send initial configuration
    await websocket.send_text(json.dumps({
        "type": "init",
        "name": HOSTNAME,
        "monitors": monitors,
        "active_monitor": screen_capturer.active_monitor_index,
        "screen": {"width": active_rect["width"], "height": active_rect["height"]},
        "battery": battery,
        "brightness": brightness,
        "ip": local_ip
    }))

    streaming = False
    target_fps = 30
    quality = 60
    scale = 0.75
    waiting_for_ack = False
    stream_task = None

    async def stream_worker():
        nonlocal streaming, waiting_for_ack
        while streaming:
            try:
                frame_start = time.perf_counter()
                
                # Capture frame for active monitor
                jpeg_data, _, _, _, _ = screen_capturer.capture_jpeg(
                    quality=quality, scale=scale, monitor_index=screen_capturer.active_monitor_index
                )
                
                await websocket.send_bytes(jpeg_data)
                waiting_for_ack = True
                
                ack_wait_start = time.perf_counter()
                while waiting_for_ack and streaming:
                    if (time.perf_counter() - ack_wait_start) > 0.15:
                        waiting_for_ack = False
                        break
                    await asyncio.sleep(0.005)

                elapsed = time.perf_counter() - frame_start
                delay = (1.0 / target_fps) - elapsed
                if delay > 0:
                    await asyncio.sleep(delay)
            except Exception:
                break

    try:
        while True:
            message = await websocket.receive_text()
            data = json.loads(message)
            msg_type = data.get("type", "")

            if msg_type == "frame_ack":
                waiting_for_ack = False

            # Monitor Switching
            elif msg_type == "select_monitor":
                index = data.get("index", 0)
                screen_capturer.set_active_monitor(index)
                active_rect = screen_capturer.get_active_monitor_rect(index)
                await websocket.send_text(json.dumps({
                    "type": "monitor_changed",
                    "index": index,
                    "screen": {"width": active_rect["width"], "height": active_rect["height"]},
                    "rect": active_rect
                }))

            # Streaming Controls
            elif msg_type == "stream_start":
                streaming = True
                target_fps = data.get("fps", 30)
                quality = data.get("quality", 60)
                scale = data.get("scale", 0.75)
                waiting_for_ack = False
                if stream_task is None or stream_task.done():
                    stream_task = asyncio.create_task(stream_worker())

            elif msg_type == "stream_stop":
                streaming = False
                if stream_task and not stream_task.done():
                    stream_task.cancel()

            # Drawing Pad / Stylus Pen Stroke
            elif msg_type == "pen_stroke":
                action = data.get("action", "move")
                x = data.get("x", 0)
                y = data.get("y", 0)
                pressure = data.get("pressure", 0.5)
                buttons = data.get("buttons", 1)
                rect = screen_capturer.get_active_monitor_rect()
                input_controller.handle_pen_stroke(
                    action=action,
                    x=x,
                    y=y,
                    pressure=pressure,
                    monitor_rect=rect,
                    buttons=buttons
                )

            # Touchpad / Mouse Movement
            elif msg_type == "mouse_move_rel":
                dx = data.get("dx", 0)
                dy = data.get("dy", 0)
                input_controller.move_mouse_relative(dx, dy)

            elif msg_type == "mouse_move_abs":
                x = data.get("x", 0)
                y = data.get("y", 0)
                rect = screen_capturer.get_active_monitor_rect()
                input_controller.move_mouse_absolute(x, y, monitor_rect=rect)

            # Drag Lock / Click and Hold
            elif msg_type == "drag_lock_toggle":
                is_active = input_controller.toggle_drag_lock()
                await websocket.send_text(json.dumps({
                    "type": "drag_lock_status",
                    "active": is_active
                }))

            # Mouse Button Actions
            elif msg_type == "mouse_down":
                btn = data.get("button", "left")
                input_controller.mouse_down(btn)

            elif msg_type == "mouse_up":
                btn = data.get("button", "left")
                input_controller.mouse_up(btn)

            elif msg_type == "mouse_click":
                btn = data.get("button", "left")
                double = data.get("double", False)
                if double:
                    input_controller.mouse_double_click(btn)
                else:
                    input_controller.mouse_click(btn)

            elif msg_type == "mouse_wheel":
                dy = data.get("delta_y", 0)
                dx = data.get("delta_x", 0)
                if dy != 0:
                    input_controller.mouse_wheel(dy)
                if dx != 0:
                    input_controller.mouse_hwheel(dx)

            # Real-Time Keystroke Input
            elif msg_type == "realtime_key":
                char = data.get("char")
                is_backspace = data.get("is_backspace", False)
                is_enter = data.get("is_enter", False)
                input_controller.handle_realtime_key(char=char, is_backspace=is_backspace, is_enter=is_enter)

            # Full Text Input
            elif msg_type == "text_input":
                text = data.get("text", "")
                if text:
                    input_controller.type_unicode_text(text)

            elif msg_type == "key_press":
                vk = data.get("vk")
                if vk:
                    input_controller.press_key(vk)

            # Brightness Controls
            elif msg_type == "brightness":
                action = data.get("action", "get")
                if action == "set":
                    val = data.get("value", 70)
                    new_val = input_controller.set_brightness(val)
                elif action == "adjust":
                    delta = data.get("delta", 10)
                    new_val = input_controller.adjust_brightness(delta)
                else:
                    new_val = input_controller.get_brightness()

                await websocket.send_text(json.dumps({
                    "type": "brightness_update",
                    "value": new_val
                }))

            # Shortcuts & Quick Actions
            elif msg_type == "shortcut":
                action = data.get("action", "")
                input_controller.execute_shortcut(action)

            # Screenshot Requests
            elif msg_type == "screenshot":
                action = data.get("action", "capture")
                if action == "snip":
                    input_controller.execute_shortcut("screenshot_snip")
                    await websocket.send_text(json.dumps({
                        "type": "notification",
                        "message": "Windows Snipping Tool opened on laptop"
                    }))
                else:
                    timestamp = time.strftime("%Y%m%d_%H%M%S")
                    active_mon = screen_capturer.active_monitor_index
                    await websocket.send_text(json.dumps({
                        "type": "screenshot_ready",
                        "url": f"/api/screenshot?monitor={active_mon}&t={int(time.time()*1000)}",
                        "filename": f"screenshot_{timestamp}.jpg"
                    }))

            # System Info Request
            elif msg_type == "get_system_info":
                battery = SystemManager.get_battery_info()
                clipboard = SystemManager.get_clipboard_text()
                brightness = input_controller.get_brightness()
                await websocket.send_text(json.dumps({
                    "type": "system_info",
                    "battery": battery,
                    "clipboard": clipboard,
                    "brightness": brightness
                }))

    except WebSocketDisconnect:
        streaming = False
        if stream_task and not stream_task.done():
            stream_task.cancel()
    except Exception:
        streaming = False
        if stream_task and not stream_task.done():
            stream_task.cancel()


routes = [
    Route("/api/status", api_status, methods=["GET"]),
    Route("/api/screenshot", api_screenshot, methods=["GET"]),
    Route("/api/clipboard", api_clipboard, methods=["GET", "POST"]),
    Route("/api/check-update", api_check_update, methods=["GET"]),
    Route("/download", api_download_apk, methods=["GET"]),
    Route("/PCRemote.apk", api_download_apk, methods=["GET"]),
    WebSocketRoute("/ws", ws_endpoint),
    Mount("/", app=StaticFiles(directory=str(STATIC_DIR), html=True), name="static"),
]

app = Starlette(routes=routes)


def start_server(port=PORT):
    print("=" * 64)
    print("  ANTIGRAVITY REMOTE DESKTOP & CONTROLLER FOR ANDROID")
    print("=" * 64)
    print(f"  Laptop IP:      {local_ip}")
    print(f"  Port:           {port}")
    monitors = screen_capturer.get_monitors()
    print(f"  Monitors:       {len(monitors)} display(s) available")
    for m in monitors:
        print(f"   - {m['name']}: {m['rect']['width']}x{m['rect']['height']}")
    print()
    print("  Open this link on your Android Phone or Advan Sketsa 2:")
    print(f"  ==> http://{local_ip}:{port}")
    print("=" * 64)
    print("  Press Ctrl+C to stop.")
    print("=" * 64)
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")


if __name__ == "__main__":
    start_server()
