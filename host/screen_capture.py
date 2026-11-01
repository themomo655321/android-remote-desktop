"""
High-Performance Windows Screen Capture & Image Encoding using native GDI and GDI+ APIs.
Supports: Multiple Monitors (Display 1, Display 2, etc.) and Combined Virtual Desktop.
"""

import ctypes
from ctypes import wintypes
import time
import win32api
import win32con

# Win32 APIs
user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32
ole32 = ctypes.windll.ole32
kernel32 = ctypes.windll.kernel32
gdiplus = ctypes.windll.gdiplus

# Ensure 64-bit safety
kernel32.GlobalLock.restype = ctypes.c_void_p
kernel32.GlobalLock.argtypes = [ctypes.c_void_p]
kernel32.GlobalSize.restype = ctypes.c_size_t
kernel32.GlobalSize.argtypes = [ctypes.c_void_p]
kernel32.GlobalUnlock.argtypes = [ctypes.c_void_p]

ole32.GetHGlobalFromStream.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
ole32.CreateStreamOnHGlobal.argtypes = [ctypes.c_void_p, wintypes.BOOL, ctypes.POINTER(ctypes.c_void_p)]

class GUID(ctypes.Structure):
    _fields_ = [
        ('Data1', wintypes.DWORD),
        ('Data2', wintypes.WORD),
        ('Data3', wintypes.WORD),
        ('Data4', ctypes.c_byte * 8)
    ]

CLSID_JPEG = GUID(0x557cf401, 0x1a04, 0x11d3, (ctypes.c_byte * 8)(0x9a, 0x73, 0x00, 0x00, 0xf8, 0x1e, 0xf3, 0x2e))
GUID_ENCODER_QUALITY = GUID(0x1d5be4b5, 0xfa4a, 0x452d, (ctypes.c_byte * 8)(0x9c, 0xdd, 0x5d, 0xb3, 0x51, 0x05, 0xe7, 0xeb))

class GdiplusStartupInput(ctypes.Structure):
    _fields_ = [
        ('GdiplusVersion', wintypes.DWORD),
        ('DebugEventCallback', ctypes.c_void_p),
        ('SuppressBackgroundThread', wintypes.BOOL),
        ('SuppressExternalCodecs', wintypes.BOOL)
    ]

class EncoderParameter(ctypes.Structure):
    _fields_ = [
        ('Guid', GUID),
        ('NumberOfValues', wintypes.ULONG),
        ('Type', wintypes.ULONG),
        ('Value', ctypes.c_void_p)
    ]

class EncoderParameters(ctypes.Structure):
    _fields_ = [
        ('Count', wintypes.UINT),
        ('Parameter', EncoderParameter * 1)
    ]


class ScreenCapturer:
    def __init__(self):
        self.token = ctypes.c_ulong()
        startup_in = GdiplusStartupInput(1, None, False, False)
        status = gdiplus.GdiplusStartup(ctypes.byref(self.token), ctypes.byref(startup_in), None)
        if status != 0:
            raise RuntimeError(f"GdiplusStartup failed with code {status}")
        
        self.active_monitor_index = 0

    def get_monitors(self):
        """Enumerates all connected physical/virtual displays."""
        monitors = []
        try:
            raw_monitors = win32api.EnumDisplayMonitors()
            for idx, m in enumerate(raw_monitors):
                hmon, _, rect = m
                info = win32api.GetMonitorInfo(hmon)
                l, t, r, b = rect
                w = r - l
                h = b - t
                is_primary = bool(info.get("Flags", 0) & win32con.MONITORINFOF_PRIMARY)
                monitors.append({
                    "id": idx,
                    "name": f"Display {idx + 1}" + (" (Main)" if is_primary else " (Extended)"),
                    "device": info.get("Device", f"DISPLAY{idx+1}"),
                    "is_primary": is_primary,
                    "rect": {"left": l, "top": t, "width": w, "height": h}
                })
        except Exception as e:
            # Fallback to primary screen
            w = user32.GetSystemMetrics(0)
            h = user32.GetSystemMetrics(1)
            monitors.append({
                "id": 0,
                "name": "Display 1 (Main)",
                "device": "DISPLAY1",
                "is_primary": True,
                "rect": {"left": 0, "top": 0, "width": w, "height": h}
            })

        # Add Combined Virtual Desktop option if more than 1 monitor
        if len(monitors) > 1:
            vx = user32.GetSystemMetrics(76) # SM_XVIRTUALSCREEN
            vy = user32.GetSystemMetrics(77) # SM_YVIRTUALSCREEN
            vw = user32.GetSystemMetrics(78) # SM_CXVIRTUALSCREEN
            vh = user32.GetSystemMetrics(79) # SM_CYVIRTUALSCREEN
            monitors.append({
                "id": -1,
                "name": "All Displays (Combined)",
                "device": "VIRTUAL_ALL",
                "is_primary": False,
                "rect": {"left": vx, "top": vy, "width": vw, "height": vh}
            })

        return monitors

    def get_active_monitor_rect(self, monitor_index=None):
        if monitor_index is None:
            monitor_index = self.active_monitor_index

        monitors = self.get_monitors()
        for m in monitors:
            if m["id"] == monitor_index:
                return m["rect"]

        # Default to first monitor
        return monitors[0]["rect"]

    def set_active_monitor(self, monitor_index):
        self.active_monitor_index = monitor_index

    def capture_jpeg(self, quality=60, scale=1.0, monitor_index=None):
        """
        Captures the requested monitor (or active monitor) and encodes to JPEG.
        monitor_index:
          0..N: Specific monitor
          -1: Combined virtual desktop (all monitors)
        """
        rect = self.get_active_monitor_rect(monitor_index)
        src_x = rect["left"]
        src_y = rect["top"]
        src_w = rect["width"]
        src_h = rect["height"]

        dst_w = max(320, int(src_w * scale))
        dst_h = max(180, int(src_h * scale))

        hdc_screen = user32.GetDC(0)
        hdc_mem = gdi32.CreateCompatibleDC(hdc_screen)
        hbm = gdi32.CreateCompatibleBitmap(hdc_screen, dst_w, dst_h)
        hbm_old = gdi32.SelectObject(hdc_mem, hbm)

        gdi32.SetStretchBltMode(hdc_mem, 3) # COLORONCOLOR
        gdi32.StretchBlt(
            hdc_mem, 0, 0, dst_w, dst_h,
            hdc_screen, src_x, src_y, src_w, src_h,
            0x00CC0020 # SRCCOPY
        )

        p_bitmap = ctypes.c_void_p()
        gdiplus.GdipCreateBitmapFromHBITMAP(hbm, 0, ctypes.byref(p_bitmap))

        p_stream = ctypes.c_void_p()
        ole32.CreateStreamOnHGlobal(None, True, ctypes.byref(p_stream))

        q_val = ctypes.c_ulong(max(10, min(100, int(quality))))
        enc_params = EncoderParameters(1)
        enc_params.Parameter[0].Guid = GUID_ENCODER_QUALITY
        enc_params.Parameter[0].NumberOfValues = 1
        enc_params.Parameter[0].Type = 4
        enc_params.Parameter[0].Value = ctypes.cast(ctypes.byref(q_val), ctypes.c_void_p)

        gdiplus.GdipSaveImageToStream(p_bitmap, p_stream, ctypes.byref(CLSID_JPEG), ctypes.byref(enc_params))

        hglobal = ctypes.c_void_p()
        ole32.GetHGlobalFromStream(p_stream, ctypes.byref(hglobal))
        size = kernel32.GlobalSize(hglobal)
        ptr = kernel32.GlobalLock(hglobal)
        
        jpeg_bytes = ctypes.string_at(ptr, size)
        kernel32.GlobalUnlock(hglobal)

        # Cleanup
        gdiplus.GdipDisposeImage(p_bitmap)
        gdi32.SelectObject(hdc_mem, hbm_old)
        gdi32.DeleteObject(hbm)
        gdi32.DeleteDC(hdc_mem)
        user32.ReleaseDC(0, hdc_screen)

        return jpeg_bytes, dst_w, dst_h, src_w, src_h

    def capture_full_screenshot(self, quality=90, monitor_index=None):
        """Captures a full-resolution screenshot of the selected monitor."""
        data, _, _, w, h = self.capture_jpeg(quality=quality, scale=1.0, monitor_index=monitor_index)
        return data, w, h
