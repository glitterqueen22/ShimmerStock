#!/usr/bin/env python3
"""Surgical post-production pass for Novi cinematic video.

This script keeps source media untouched and creates:
- public/assets/video/novi-day-with-shimmerstock-master.mp4
- public/assets/video/novi-day-with-shimmerstock.webm
- public/assets/video/novi-day-with-shimmerstock-poster.webp
- qa-results/video-post/* evidence artifacts
"""

from __future__ import annotations

import math
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public/assets/video/shimmerstockkk.mp4"
MASTER = ROOT / "public/assets/video/novi-day-with-shimmerstock-master.mp4"
WEBM = ROOT / "public/assets/video/novi-day-with-shimmerstock.webm"
POSTER = ROOT / "public/assets/video/novi-day-with-shimmerstock-poster.webp"
QA_DIR = ROOT / "qa-results/video-post"
FRAMES_DIR = QA_DIR / "frames"
EVIDENCE_DIR = QA_DIR / "evidence"
PREVIEW = QA_DIR / "preview.mp4"

TRIM_FRAMES = 59  # 0.983333s at 60fps


@dataclass
class VideoMeta:
    fps: float
    width: int
    height: int
    frame_count: int


def ensure_dirs() -> None:
    QA_DIR.mkdir(parents=True, exist_ok=True)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    if FRAMES_DIR.exists():
        shutil.rmtree(FRAMES_DIR)
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)


def get_meta(path: Path) -> VideoMeta:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 60.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    return VideoMeta(fps=fps, width=width, height=height, frame_count=frame_count)


def ffmpeg_bin() -> str:
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def run(cmd: list[str]) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=True)


def rounded_rect_overlay(frame: np.ndarray, x: int, y: int, w: int, h: int, radius: int, color: tuple[int, int, int], alpha: float) -> None:
    overlay = frame.copy()
    x2, y2 = x + w, y + h
    radius = max(2, min(radius, w // 2, h // 2))

    cv2.rectangle(overlay, (x + radius, y), (x2 - radius, y2), color, -1)
    cv2.rectangle(overlay, (x, y + radius), (x2, y2 - radius), color, -1)
    cv2.circle(overlay, (x + radius, y + radius), radius, color, -1)
    cv2.circle(overlay, (x2 - radius, y + radius), radius, color, -1)
    cv2.circle(overlay, (x + radius, y2 - radius), radius, color, -1)
    cv2.circle(overlay, (x2 - radius, y2 - radius), radius, color, -1)

    cv2.addWeighted(overlay, alpha, frame, 1.0 - alpha, 0, frame)


def draw_text_badge(frame: np.ndarray, x: int, y: int, lines: list[str], scale: float = 0.65) -> None:
    line_h = int(30 * scale)
    pad_x = int(16 * scale)
    pad_y = int(12 * scale)
    w = int(max(len(l) for l in lines) * 15 * scale + 2 * pad_x)
    h = int(len(lines) * line_h + 2 * pad_y)
    rounded_rect_overlay(frame, x, y, w, h, radius=max(8, int(14 * scale)), color=(248, 240, 252), alpha=0.9)
    cv2.rectangle(frame, (x, y), (x + w, y + h), (203, 184, 221), 2)

    ty = y + pad_y + line_h - int(8 * scale)
    for idx, line in enumerate(lines):
        thickness = 2 if idx == 0 else 1
        cv2.putText(
            frame,
            line,
            (x + pad_x, ty),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.52 * scale if idx == 0 else 0.5 * scale,
            (49, 27, 78),
            thickness,
            cv2.LINE_AA,
        )
        ty += line_h


def make_brand_icon() -> np.ndarray:
    # Build a tiny sparkle-inspired brand glyph using canonical pink and plum tones.
    icon = np.zeros((96, 96, 4), dtype=np.uint8)
    cx, cy = 48, 48

    pink = (114, 63, 244, 235)  # B,G,R,A
    plum = (78, 27, 45, 255)
    blush = (199, 180, 255, 220)

    pts = np.array(
        [
            (cx, 10),
            (cx + 10, cy - 10),
            (86, cy),
            (cx + 10, cy + 10),
            (cx, 86),
            (cx - 10, cy + 10),
            (10, cy),
            (cx - 10, cy - 10),
        ],
        dtype=np.int32,
    )
    cv2.fillConvexPoly(icon, pts, pink)
    cv2.polylines(icon, [pts], True, plum, 3, cv2.LINE_AA)
    cv2.circle(icon, (70, 24), 8, blush, -1, cv2.LINE_AA)
    cv2.circle(icon, (25, 73), 5, blush, -1, cv2.LINE_AA)
    return icon


def alpha_blit(frame: np.ndarray, rgba: np.ndarray, x: int, y: int) -> None:
    h, w = rgba.shape[:2]
    if x < 0 or y < 0 or x + w > frame.shape[1] or y + h > frame.shape[0]:
        return
    roi = frame[y : y + h, x : x + w].astype(np.float32)
    rgb = rgba[:, :, :3].astype(np.float32)
    alpha = (rgba[:, :, 3:4].astype(np.float32) / 255.0)
    out = rgb * alpha + roi * (1.0 - alpha)
    frame[y : y + h, x : x + w] = out.astype(np.uint8)


def detect_pink_cup_bbox(frame: np.ndarray, roi: tuple[int, int, int, int]) -> tuple[int, int, int, int] | None:
    x1, y1, x2, y2 = roi
    crop = frame[y1:y2, x1:x2]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)

    mask1 = cv2.inRange(hsv, (140, 50, 70), (179, 255, 255))
    mask2 = cv2.inRange(hsv, (130, 30, 90), (175, 180, 255))
    mask = cv2.bitwise_or(mask1, mask2)
    mask = cv2.medianBlur(mask, 5)
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best = None
    best_area = 0
    for c in contours:
        area = cv2.contourArea(c)
        if area < 600:
            continue
        x, y, w, h = cv2.boundingRect(c)
        if h < 30 or w < 30:
            continue
        if area > best_area:
            best_area = area
            best = (x1 + x, y1 + y, w, h)
    return best


def cover_old_cup_text(frame: np.ndarray, bbox: tuple[int, int, int, int]) -> None:
    x, y, w, h = bbox
    cx = int(x + w * 0.55)
    cy = int(y + h * 0.56)
    ew = int(w * 0.42)
    eh = int(h * 0.26)

    patch = frame.copy()
    cv2.ellipse(patch, (cx, cy), (max(18, ew // 2), max(12, eh // 2)), -12, 0, 360, (170, 120, 165), -1, cv2.LINE_AA)
    cv2.addWeighted(patch, 0.45, frame, 0.55, 0, frame)


def place_sparkle_on_cup(frame: np.ndarray, icon: np.ndarray, bbox: tuple[int, int, int, int]) -> None:
    x, y, w, h = bbox
    size = max(20, min(56, int(min(w, h) * 0.36)))
    icon_rs = cv2.resize(icon, (size, size), interpolation=cv2.INTER_AREA)
    px = int(x + w * 0.48 - size // 2)
    py = int(y + h * 0.52 - size // 2)
    alpha_blit(frame, icon_rs, px, py)


def track_and_clean_package_label(frame: np.ndarray) -> None:
    roi = frame[640:860, 620:980]
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    _, th = cv2.threshold(gray, 190, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    best = None
    best_score = 0
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        area = w * h
        if area < 1000 or area > 20000:
            continue
        ratio = w / max(1.0, h)
        if ratio < 2.2 or ratio > 7.5:
            continue
        score = area
        if score > best_score:
            best_score = score
            best = (x + 620, y + 640, w, h)

    if best is None:
        return

    x, y, w, h = best
    rounded_rect_overlay(frame, x - 2, y - 2, w + 4, h + 4, radius=6, color=(245, 245, 245), alpha=0.95)
    cv2.rectangle(frame, (x, y), (x + w, y + h), (214, 214, 214), 1)


def extract_before_after(meta: VideoMeta, out_frame_count: int) -> None:
    cap_src = cv2.VideoCapture(str(SRC))
    cap_out = cv2.VideoCapture(str(MASTER))

    # (name, source_frame)
    samples = [
        ("opening_trim", TRIM_FRAMES - 1),
        ("cup_mark_front", int(meta.fps * 5.5)),
        ("cup_mark_side", int(meta.fps * 8.9)),
        ("label_cleanup", int(meta.fps * 15.4)),
        ("new_order_overlay", int(meta.fps * 20.1)),
        ("label_needs_reprint_overlay", int(meta.fps * 14.8)),
        ("closing_cup_mark", int(meta.fps * 28.2)),
    ]

    for name, src_f in samples:
        cap_src.set(cv2.CAP_PROP_POS_FRAMES, src_f)
        ok_b, before = cap_src.read()
        if not ok_b:
            continue

        out_f = max(0, src_f - TRIM_FRAMES)
        cap_out.set(cv2.CAP_PROP_POS_FRAMES, out_f)
        ok_a, after = cap_out.read()
        if not ok_a:
            continue

        cv2.imwrite(str(EVIDENCE_DIR / f"{name}-before.png"), before)
        cv2.imwrite(str(EVIDENCE_DIR / f"{name}-after.png"), after)

    cap_src.release()
    cap_out.release()


def build_evidence_sheet() -> None:
    pairs = [
        ("opening_trim", "Opening trim removed collage frame"),
        ("cup_mark_front", "Cup lettering replaced with brand icon (front shot)"),
        ("cup_mark_side", "Cup lettering replaced with brand icon (side shot)"),
        ("label_cleanup", "Shipping label gibberish replaced with clean geometry"),
        ("new_order_overlay", "Real text overlay for order signal"),
        ("label_needs_reprint_overlay", "Real text overlay for issue moment"),
        ("closing_cup_mark", "Cup branding cleanup in ending shot"),
    ]

    font = ImageFont.load_default()
    cards = []
    for key, title in pairs:
        b = EVIDENCE_DIR / f"{key}-before.png"
        a = EVIDENCE_DIR / f"{key}-after.png"
        if not (b.exists() and a.exists()):
            continue

        ib = Image.open(b).convert("RGB").resize((640, 427), Image.Resampling.LANCZOS)
        ia = Image.open(a).convert("RGB").resize((640, 427), Image.Resampling.LANCZOS)
        card = Image.new("RGB", (1320, 500), (18, 18, 22))
        card.paste(ib, (20, 52))
        card.paste(ia, (660, 52))
        d = ImageDraw.Draw(card)
        d.rectangle((20, 16, 300, 40), fill=(0, 0, 0))
        d.text((30, 22), "BEFORE", fill=(255, 255, 255), font=font)
        d.rectangle((660, 16, 940, 40), fill=(0, 0, 0))
        d.text((670, 22), "AFTER", fill=(255, 255, 255), font=font)
        d.text((20, 486 - 20), title, fill=(235, 235, 235), font=font)
        cards.append(card)

    if not cards:
        return

    h = sum(c.height for c in cards) + 16 * (len(cards) - 1)
    sheet = Image.new("RGB", (1320, h), (12, 12, 15))
    y = 0
    for c in cards:
        sheet.paste(c, (0, y))
        y += c.height + 16

    sheet.save(EVIDENCE_DIR / "before-after-sheet.jpg", quality=92)


def process_frames(meta: VideoMeta) -> int:
    cap = cv2.VideoCapture(str(SRC))
    icon = make_brand_icon()

    idx_out = 0
    idx_in = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx_in < TRIM_FRAMES:
            idx_in += 1
            continue

        t = idx_out / meta.fps

        # Cup cleanup and icon replacement in main cup shots.
        if 3.2 <= t <= 9.9:
            bbox = detect_pink_cup_bbox(frame, (760, 340, 1560, 980))
            if bbox is not None:
                cover_old_cup_text(frame, bbox)
                place_sparkle_on_cup(frame, icon, bbox)

        # Cup on desk with side scribble.
        if 8.9 <= t <= 10.4:
            bbox = detect_pink_cup_bbox(frame, (120, 500, 620, 1020))
            if bbox is not None:
                cover_old_cup_text(frame, bbox)
                place_sparkle_on_cup(frame, icon, bbox)

        # Conveyor package top label gibberish cleanup.
        if 12.8 <= t <= 21.9:
            track_and_clean_package_label(frame)

        # Small intentional real-text overlays (limited count).
        if 13.9 <= t <= 16.1:
            draw_text_badge(frame, 620, 360, ["LABEL NEEDS REPRINT"], scale=0.78)

        if 18.9 <= t <= 21.2:
            draw_text_badge(frame, 1140, 380, ["NEW ORDER", "#8197"], scale=0.72)

        # Ending cup branding cleanup.
        if 24.8 <= t <= 29.0:
            bbox = detect_pink_cup_bbox(frame, (930, 540, 1618, 1080))
            if bbox is not None:
                cover_old_cup_text(frame, bbox)
                place_sparkle_on_cup(frame, icon, bbox)

        if 27.6 <= t <= 29.0:
            draw_text_badge(frame, 90, 920, ["YOU'RE CAUGHT UP."], scale=0.72)

        out_path = FRAMES_DIR / f"frame_{idx_out:06d}.png"
        cv2.imwrite(str(out_path), frame)

        idx_out += 1
        idx_in += 1

    cap.release()
    return idx_out


def encode_outputs(meta: VideoMeta, out_frames: int) -> None:
    ffmpeg = ffmpeg_bin()
    trim_sec = TRIM_FRAMES / meta.fps

    # Master MP4 with trimmed source audio.
    run(
        [
            ffmpeg,
            "-y",
            "-framerate",
            f"{meta.fps:.6f}",
            "-i",
            str(FRAMES_DIR / "frame_%06d.png"),
            "-ss",
            f"{trim_sec:.6f}",
            "-i",
            str(SRC),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "libx264",
            "-preset",
            "slow",
            "-crf",
            "14",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "320k",
            "-shortest",
            str(MASTER),
        ]
    )

    # WebM delivery variant.
    run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(MASTER),
            "-c:v",
            "libvpx-vp9",
            "-b:v",
            "0",
            "-crf",
            "33",
            "-row-mt",
            "1",
            "-deadline",
            "good",
            "-cpu-used",
            "1",
            "-c:a",
            "libopus",
            "-b:a",
            "128k",
            str(WEBM),
        ]
    )

    # Poster frame from calm early hero moment after trim.
    run(
        [
            ffmpeg,
            "-y",
            "-ss",
            "00:00:04.200",
            "-i",
            str(MASTER),
            "-frames:v",
            "1",
            "-c:v",
            "libwebp",
            "-q:v",
            "78",
            "-compression_level",
            "6",
            str(POSTER),
        ]
    )

    # Short owner preview clip.
    run(
        [
            ffmpeg,
            "-y",
            "-ss",
            "00:00:03.500",
            "-t",
            "00:00:08.000",
            "-i",
            str(MASTER),
            "-vf",
            "scale=1080:-2",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(PREVIEW),
        ]
    )


def write_report(meta: VideoMeta, out_frames: int) -> None:
    trim_sec = TRIM_FRAMES / meta.fps
    duration = out_frames / meta.fps

    def size_mb(path: Path) -> float:
        return path.stat().st_size / (1024 * 1024)

    report = [
        "# Video Post-Production Report",
        "",
        f"- Source: {SRC}",
        f"- Trim start: frame {TRIM_FRAMES} ({trim_sec:.6f}s)",
        f"- Source FPS: {meta.fps:.3f}",
        f"- Source Resolution: {meta.width}x{meta.height}",
        f"- Output frame count: {out_frames}",
        f"- Output duration: {duration:.3f}s",
        "",
        "## Cup branding handling",
        "- Kept cup in all shots.",
        "- Removed generated lettering using soft in-shot color blending on detected cup body.",
        "- Added a subtle real ShimmerStock brand icon overlay (sparkle-inspired mark) anchored to cup detection per frame.",
        "",
        "## Outputs",
        f"- Master MP4: {MASTER} ({size_mb(MASTER):.2f} MB)",
        f"- WebM: {WEBM} ({size_mb(WEBM):.2f} MB)",
        f"- Poster WEBP: {POSTER} ({size_mb(POSTER):.2f} MB)",
        f"- Preview clip: {PREVIEW} ({size_mb(PREVIEW):.2f} MB)",
        "",
        "## Evidence",
        f"- Before/after sheet: {EVIDENCE_DIR / 'before-after-sheet.jpg'}",
    ]
    (QA_DIR / "report.md").write_text("\n".join(report), encoding="utf-8")


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing source: {SRC}")

    ensure_dirs()
    meta = get_meta(SRC)
    out_frames = process_frames(meta)
    encode_outputs(meta, out_frames)
    extract_before_after(meta, out_frames)
    build_evidence_sheet()
    write_report(meta, out_frames)

    print("Done.")
    print(f"Master: {MASTER}")
    print(f"WebM:   {WEBM}")
    print(f"Poster: {POSTER}")


if __name__ == "__main__":
    main()
