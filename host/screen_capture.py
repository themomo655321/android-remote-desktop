"""
High-Performance Windows Screen Capture & Image Encoding using native GDI and GDI+ APIs.
Zero external pip dependencies required.
"""

import ctypes
from ctypes import wintypes
import time

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

# JPEG Encoder CLSID: {557CF401-1A04-11D3-9A73-0000F81EF32E}
CLSID_JPEG = GUID(0x557cf401, 0x1a04, 0x11d3, (ctypes.c_byte * 8)(0x9a, 0x73, 0x00, 0x00, 0xf8, 0x1e, 0xf3, 0x2e))

# Encoder Quality GUID: {1D5BE4B5-FA4A-452D-9CDD-5DB35105E7EB}
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
        
        # Screen dimensions
        self.screen_width = user32.GetSystemMetrics(0)
        self.screen_height = user32.GetSystemMetrics(1)
        
    def get_screen_size(self):
        # Refresh in case resolution changed
        self.screen_width = user32.GetSystemMetrics(0)
        self.screen_height = user32.GetSystemMetrics(1)
        return self.screen_width, self.screen_height

    def capture_jpeg(self, quality=60, scale=1.0):
        """
        Captures the screen and encodes it to a JPEG byte string.
        quality: 10 - 100
        scale: 0.25 - 1.0 (downscaling for faster transport)
        """
        src_w, src_h = self.get_screen_size()
        dst_w = max(320, int(src_w * scale))
        dst_h = max(180, int(src_h * scale))

        hdc_screen = user32.GetDC(0)
        hdc_mem = gdi32.CreateCompatibleDC(hdc_screen)
        hbm = gdi32.CreateCompatibleBitmap(hdc_screen, dst_w, dst_h)
        hbm_old = gdi32.SelectObject(hdc_mem, hbm)

        # Set stretch blt mode for cleaner downscaling
        gdi32.SetStretchBltMode(hdc_mem, 3) # COLORONCOLOR
        gdi32.StretchBlt(
            hdc_mem, 0, 0, dst_w, dst_h,
            hdc_screen, 0, 0, src_w, src_h,
            0x00CC0020 # SRCCOPY
        )

        p_bitmap = ctypes.c_void_p()
        gdiplus.GdipCreateBitmapFromHBITMAP(hbm, 0, ctypes.byref(p_bitmap))

        p_stream = ctypes.c_void_p()
        ole32.CreateStreamOnHGlobal(None, True, ctypes.byref(p_stream))

        # Setup quality parameter
        q_val = ctypes.c_ulong(max(10, min(100, int(quality))))
        enc_params = EncoderParameters(1)
        enc_params.Parameter[0].Guid = GUID_ENCODER_QUALITY
        enc_params.Parameter[0].NumberOfValues = 1
        enc_params.Parameter[0].Type = 4 # EncoderParameterValueTypeLong
        enc_params.Parameter[0].Value = ctypes.cast(ctypes.byref(q_val), ctypes.c_void_p)

        gdiplus.GdipSaveImageToStream(p_bitmap, p_stream, ctypes.byref(CLSID_JPEG), ctypes.byref(enc_params))

        hglobal = ctypes.c_void_p()
        ole32.GetHGlobalFromStream(p_stream, ctypes.byref(hglobal))
        size = kernel32.GlobalSize(hglobal)
        ptr = kernel32.GlobalLock(hglobal)
        
        jpeg_bytes = ctypes.string_at(ptr, size)
        kernel32.GlobalUnlock(hglobal)

        # Cleanup COM / GDI handles
        gdiplus.GdipDisposeImage(p_bitmap)
        gdi32.SelectObject(hdc_mem, hbm_old)
        gdi32.DeleteObject(hbm)
        gdi32.DeleteDC(hdc_mem)
        user32.ReleaseDC(0, hdc_screen)

        # Note: p_stream will be automatically released when HGlobal is freed or overwritten
        return jpeg_bytes, dst_w, dst_h, src_w, src_h

    def capture_full_screenshot(self, quality=90):
        """Captures a pristine, full-resolution screenshot."""
        data, _, _, w, h = self.capture_jpeg(quality=quality, scale=1.0)
        return data, w, h
