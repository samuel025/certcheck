import cv2, json, sys
man = json.load(open("qrout/manifest.json")); bad = 0
det = cv2.QRCodeDetector()
for m in man:
    img = cv2.imread(m["file"]); val, pts, _ = det.detectAndDecode(img)
    ok = val == m["text"]; bad += 0 if ok else 1
    print("ok  " if ok else "FAIL", m["file"], len(m["text"]), "chars", "" if ok else f"decoded={val[:60]!r}")
sys.exit(1 if bad else 0)
