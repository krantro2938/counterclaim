#!/usr/bin/env python3
"""Assemble the final demo video: HyperFrames scenes + headless app recordings + ElevenLabs VO + captions.

    python3 video/tools/assemble.py            # writes video/out/counterclaim-demo.mp4

Each segment = list of (source, start, end, speed) parts; the VO line for that segment starts at
`vo_at` seconds into it. Recordings are only sped up in dull stretches (mouse travel); PayPal's own
response time plays at 1x.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out"
REC = ROOT / "recordings"
VO = ROOT / "audio" / "vo"
TMP = OUT / "segments"
TMP.mkdir(parents=True, exist_ok=True)

G = lambda name: OUT / f"{name}.mp4"  # noqa: E731  rendered HyperFrames scene
R = lambda name: REC / f"{name}.mp4"  # noqa: E731  app recording

WON = REC / "take-B2-won.mp4"

SEGMENTS = [
    # id, parts [(file, start, end, speed)], vo id, vo offset
    ("01", [(G("s01-opener"), 0, 12, 1)], "01", 0.6),
    ("02", [(G("s02-problem"), 0, 12, 1)], "02", 0.6),
    ("03", [(G("s03-title"), 0, 7, 1)], "03", 0.8),
    ("04", [(G("ch-prevent"), 0, 1.6, 1), (R("take-A-prevent"), 1.5, 20.5, 1.8), (R("take-A-prevent"), 52, 56.2, 1)], "04", 1.9),
    ("05", [(G("ch-defend"), 0, 1.6, 1), (R("take-B-defend"), 0.5, 7.6, 1)], "05", 1.9),
    ("06", [(R("take-B-defend"), 7.6, 22.6, 1)], "06", 0.3),
    ("07", [(R("take-B-defend"), 22.6, 31.6, 1.5), (R("take-B-defend"), 31.6, 42.5, 1)], "07", 0.3),
    ("08", [(WON, 0.3, 6.3, 1)], "08", 0.6),
    ("09", [(G("ch-decide"), 0, 1.6, 1), (R("take-C-decide"), 2.6, 11.6, 1.4), (R("take-C-decide"), 19.4, 23.2, 1.2), (R("take-C-decide"), 23.2, 31.5, 1)], "09", 1.9),
    ("10", [(R("take-D-honest"), 1.2, 11.5, 1.3)], "10", 0.4),
    ("11", [(G("s11-architecture"), 0, 16, 1)], "11", 0.8),
    ("12", [(G("s12-outro"), 0, 7, 1)], "12", 0.8),
]


def dur(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def run(args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def build_segment(sid, parts):
    files = []
    for i, (src, a, b, speed) in enumerate(parts):
        b = min(b, dur(src))
        part = TMP / f"seg{sid}-{i}.mp4"
        run([
            "-ss", f"{a}", "-to", f"{b}", "-i", str(src),
            "-vf", f"setpts=(PTS-STARTPTS)/{speed},fps=30,scale=1920:1080:flags=lanczos,format=yuv420p",
            "-an", "-c:v", "libx264", "-crf", "15", "-preset", "medium", str(part),
        ])
        files.append(part)
    lst = TMP / f"seg{sid}.txt"
    lst.write_text("".join(f"file '{f}'\n" for f in files))
    seg = TMP / f"seg{sid}.mp4"
    run(["-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(seg)])
    return seg


def ass_time(t):
    h = int(t // 3600)
    m = int(t % 3600 // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def chunks(text, limit=62):
    """Split a VO line into caption chunks of at most ~2 lines, on sentence/comma boundaries."""
    words, out, cur = text.split(), [], ""
    for w in words:
        nxt = f"{cur} {w}".strip()
        if len(nxt) > limit * 2 or (len(cur) > limit and cur.endswith((".", ","))):
            out.append(cur)
            cur = w
        else:
            cur = nxt
    if cur:
        out.append(cur)
    return out


def main():
    lines = dict(json.loads((VO / "lines.json").read_text()))
    segs, offsets, t = [], [], 0.0
    for sid, parts, vo, at in SEGMENTS:
        seg = build_segment(sid, parts)
        d = dur(seg)
        vo_d = dur(VO / f"seg-{vo}.wav")
        if at + vo_d + 0.4 > d:  # hold the last frame if the line runs longer than the picture
            held = TMP / f"seg{sid}-held.mp4"
            run(["-i", str(seg), "-vf", f"tpad=stop_mode=clone:stop_duration={at + vo_d + 0.5 - d:.2f}", "-c:v", "libx264", "-crf", "15", "-preset", "medium", str(held)])
            seg, d = held, dur(held)
        segs.append(seg)
        offsets.append((t, vo, at, vo_d))
        t += d
    total = t

    lst = TMP / "all.txt"
    lst.write_text("".join(f"file '{s}'\n" for s in segs))
    video = TMP / "video.mp4"
    run(["-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(video)])

    # VO mix: each line delayed to its absolute position.
    inputs, filters = [], []
    for i, (start, vo, at, _) in enumerate(offsets):
        inputs += ["-i", str(VO / f"seg-{vo}.wav")]
        ms = int((start + at) * 1000)
        filters.append(f"[{i}:a]adelay={ms}|{ms}[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(len(offsets)))
    filters.append(f"{mix}amix=inputs={len(offsets)}:normalize=0,apad=whole_dur={total:.2f}[vo]")
    audio = TMP / "vo.wav"
    run([*inputs, "-filter_complex", ";".join(filters), "-map", "[vo]", "-ar", "48000", "-ac", "2", str(audio)])

    # Captions: each line split into chunks, timed proportionally to characters.
    events = []
    for start, vo, at, vo_d in offsets:
        parts = chunks(lines[vo])
        total_chars = sum(len(p) for p in parts)
        cur = start + at
        for p in parts:
            d = vo_d * len(p) / total_chars
            events.append((cur, cur + d, p))
            cur += d
    ass = TMP / "captions.ass"
    ass.write_text(
        "[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        "Style: Cap,Noto Sans,44,&H00FFFFFF,&H00FFFFFF,&H00000000,&H9A1A2A20,0,0,0,0,100,100,0,0,3,14,0,2,260,260,54,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        + "".join(f"Dialogue: 0,{ass_time(a)},{ass_time(b)},Cap,,0,0,0,,{txt}\n" for a, b, txt in events)
    )

    final = OUT / "counterclaim-demo.mp4"
    run([
        "-i", str(video), "-i", str(audio),
        "-vf", f"ass={ass}",
        "-c:v", "libx264", "-crf", "17", "-preset", "slow", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(final),
    ])
    print(f"{final}  {dur(final):.1f}s")


if __name__ == "__main__":
    main()
