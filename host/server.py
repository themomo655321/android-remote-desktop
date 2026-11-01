"""
Antigravity Remote Desktop & Controller - Host Server
Combines high-performance screen capture, Windows input injection,
and low-latency WebSocket communication with Starlette and Uvicorn.
"""

import os
import sys
import json
import time
import asyncio
from pathlib import Path

# Add parent directory to sys.path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR.parent))

from starlette.applications import Starlette
from starlette.responses import JSONResponse, Response, FileResponse
from starlette.routing import Route, WebSocketRoute, Mount
from starlette.staticfiles import StaticFiles
from starlette.websockets import WebSocket, WebSocketDisconnect
import uvicorn

from host.screen_capture import ScreenCapturer
from host.input_controller import InputController
from host.system_info import SystemManager

# Initialize core services
screen_capturer = ScreenCapturer()
input_controller = InputController()
local_ip = SystemManager.get_local_ip()
PORT = 5000

# Directory for static files
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)


async def api_status(request):
    """Returns system status, resolution, and battery."""
    w, h = screen_capturer.get_screen_size()
    battery = SystemManager.get_battery_info()
    clipboard = SystemManager.get_clipboard_text()
    return JSONResponse({
        "status": "online",
        "ip": local_ip,
        "port": PORT,
        "screen": {"width": w, "height": h},
        "battery": battery,
        "clipboard": clipboard
    })


async def api_screenshot(request):
    """Captures and returns a full-resolution JPEG screenshot."""
    jpeg_bytes, w, h = screen_capturer.capture_full_screenshot(quality=90)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    headers = {
        "Content-Disposition": f'inline; filename="laptop_screenshot_{timestamp}.jpg"',
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


async def ws_endpoint(websocket: WebSocket):
    """Main bidirectional control and video streaming endpoint."""
    await websocket.accept()
    
    w, h = screen_capturer.get_screen_size()
    battery = SystemManager.get_battery_info()
    
    # Send initial configuration
    await websocket.send_text(json.dumps({
        "type": "init",
        "screen": {"width": w, "height": h},
        "battery": battery,
        "ip": local_ip
    }))

    # Stream settings
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
                
                # Capture frame
                jpeg_data, _, _, _, _ = screen_capturer.capture_jpeg(quality=quality, scale=scale)
                
                # Send binary frame to client
                await websocket.send_bytes(jpeg_data)
                waiting_for_ack = True
                
                # Wait until client acknowledges frame OR timeout (avoids stalling)
                ack_wait_start = time.perf_counter()
                while waiting_for_ack and streaming:
                    if (time.perf_counter() - ack_wait_start) > 0.15:
                        waiting_for_ack = False # Force next frame if client dropped ack
                        break
                    await asyncio.sleep(0.005)

                # Framerate throttle
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

            # Frame acknowledgment for adaptive flow control
            if msg_type == "frame_ack":
                waiting_for_ack = False

            # Screen Streaming Controls
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

            elif msg_type == "stream_config":
                target_fps = data.get("fps", target_fps)
                quality = data.get("quality", quality)
                scale = data.get("scale", scale)

            # Touchpad / Mouse Movement
            elif msg_type == "mouse_move_rel":
                dx = data.get("dx", 0)
                dy = data.get("dy", 0)
                input_controller.move_mouse_relative(dx, dy)

            elif msg_type == "mouse_move_abs":
                x = data.get("x", 0)
                y = data.get("y", 0)
                input_controller.move_mouse_absolute(x, y)

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

            # Keyboard & Text Input
            elif msg_type == "text_input":
                text = data.get("text", "")
                if text:
                    input_controller.type_unicode_text(text)

            elif msg_type == "key_press":
                vk = data.get("vk")
                if vk:
                    input_controller.press_key(vk)

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
                    # Instant capture
                    timestamp = time.strftime("%Y%m%d_%H%M%S")
                    await websocket.send_text(json.dumps({
                        "type": "screenshot_ready",
                        "url": f"/api/screenshot?t={int(time.time()*1000)}",
                        "filename": f"screenshot_{timestamp}.jpg"
                    }))

            # System & Battery update request
            elif msg_type == "get_system_info":
                battery = SystemManager.get_battery_info()
                clipboard = SystemManager.get_clipboard_text()
                await websocket.send_text(json.dumps({
                    "type": "system_info",
                    "battery": battery,
                    "clipboard": clipboard
                }))

    except WebSocketDisconnect:
        streaming = False
        if stream_task and not stream_task.done():
            stream_task.cancel()
    except Exception as e:
        streaming = False
        if stream_task and not stream_task.done():
            stream_task.cancel()


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


# Define application routes
routes = [
    Route("/api/status", api_status, methods=["GET"]),
    Route("/api/screenshot", api_screenshot, methods=["GET"]),
    Route("/api/clipboard", api_clipboard, methods=["GET", "POST"]),
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
    print()
    print("  Open this link on your Android Phone or Advan Sketsa 2:")
    print(f"  ==> http://{local_ip}:{port}")
    print("=" * 64)
    print("  Press Ctrl+C to stop.")
    print("=" * 64)
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")


if __name__ == "__main__":
    start_server()
