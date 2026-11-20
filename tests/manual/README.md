# Manual QR scan check (real decoder)

Renders certificate QR codes in Chrome at whole-pixel module size and decodes the screenshots with OpenCV, as a phone would.
Not part of the default suite (needs a Python venv with `opencv-python-headless`).

    node tests/manual/qr-scan-render.mjs        # writes qrout/*.png + manifest.json (run from a folder with puppeteer-core)
    python tests/manual/qr-scan-decode.py       # decodes each PNG and compares with the expected link

Last run (2026-11-20): 5/5 links decoded exactly (383 to 1,244 characters, accented and CJK names), with both OpenCV decoders.
Note: images scaled to a non-integer pixels-per-module blur and can fail in the classic decoder even for qrencode's own output; print or display QR codes at whole-pixel module sizes.
