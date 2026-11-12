#!/usr/bin/env python3
"""Assemble the final demo video: HyperFrames scenes + headless app recordings + ElevenLabs VO + captions.

    python3 video/tools/assemble.py            # writes video/out/counterclaim-demo.mp4

The voice-over drives the edit. Each segment lasts exactly as long as its VO line (plus a short
breath), so there is no dead air. Recording parts flex their speed to fit, and static stretches
(PayPal round-trips, page loads) are cut or sped up in the part list. A virtual camera (eased
zoom/pan keyframes per take) keeps the action readable and the picture moving.
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
TAKES = {
    "A": REC / "take-A-prevent.mp4",
    "B": REC / "take-B-defend.mp4",
    "T": REC / "take-T-trace.mp4",
    "W": REC / "take-B2-won.mp4",
    "C": REC / "take-C-decide.mp4",
    "D": REC / "take-D-honest.mp4",
}

# Virtual camera per take, in source seconds: (t, zoom, centre x, centre y) on the 1920×1080 frame.
# Between keyframes the camera eases (smoothstep); repeat a keyframe to hold.
CAM = {
    "A": [(0, 1, 960, 540), (1.2, 1, 960, 540), (2.2, 1.4, 700, 420), (4.5, 1.4, 700, 420), (5.3, 1, 960, 540),
          (8.6, 1, 960, 540), (9.5, 1.5, 1230, 470), (17.6, 1.5, 1230, 470), (18.5, 1.5, 1300, 760),
          (46.9, 1.5, 1300, 760), (47.0, 1.4, 760, 800), (99, 1.4, 760, 800)],
    "B": [(0, 1, 960, 540), (0.8, 1, 960, 540), (1.8, 1.25, 1060, 480), (5.0, 1.25, 1060, 480), (5.8, 1, 960, 540),
          (6.2, 1, 960, 540), (6.9, 1.3, 640, 640), (8.2, 1.3, 640, 640), (9.0, 1.5, 1380, 420), (11.9, 1.5, 1380, 420),
          (12.6, 1.5, 680, 640), (21.9, 1.5, 680, 640), (22.0, 1.4, 1380, 520), (23.6, 1.4, 1380, 520),
          (24.4, 1.45, 1430, 500), (28.9, 1.45, 1430, 500), (29.6, 1.4, 1000, 520), (38.4, 1.4, 1000, 520),
          (39.2, 1.45, 1500, 700), (99, 1.45, 1500, 700)],
    "T": [(0, 1.6, 690, 720), (99, 1.6, 690, 720)],
    "W": [(0, 1, 960, 540), (1.8, 1, 960, 540), (3.6, 1.5, 1350, 400), (99, 1.5, 1350, 400)],
    "C": [(0, 1.25, 1060, 480), (2.6, 1.25, 1060, 480), (3.3, 1, 960, 540), (3.7, 1, 960, 540), (4.4, 1.4, 720, 600),
          (6.6, 1.4, 720, 600), (7.3, 1.5, 1380, 420), (8.8, 1.5, 1380, 420), (9.5, 1.6, 1400, 800),
          (20.2, 1.6, 1400, 800), (20.8, 1.45, 1050, 560), (28.4, 1.45, 1050, 560), (29.2, 1.4, 1440, 700),
          (99, 1.4, 1440, 700)],
    "D": [(0, 1, 960, 540), (1.0, 1, 960, 540), (2.0, 1.5, 1450, 520), (99, 1.5, 1450, 520)],
}


def P(src, a, b, speed=1.0):
    """A part: a take key (flexes to fit the VO, gets the camera) or a scene file (plays at 1x)."""
    return (src, a, b, speed)


# id, parts, vo line, vo offset into the segment, crossfade from the previous segment
SEGMENTS = [
    ("01", [P(G("s01-opener"), 0, 99)], "01", 0.5, 0),
    ("02", [P(G("s02-problem"), 0, 99)], "02", 0.3, 0.3),
    ("03", [P(G("s03-title"), 0, 99)], "03", 0.3, 0.3),
    ("04", [P(G("ch-prevent"), 0, 1.6), P("A", 0.6, 5.2, 0.85), P("A", 5.2, 15.3), P("A", 15.3, 17.9, 2),
            P("A", 17.9, 21.5), P("A", 47.0, 50.0)], "04", 0.25, 0.3),
    ("05", [P(G("ch-defend"), 0, 2.0), P("B", 0.0, 5.8, 0.9)], "05", 0.25, 0.3),
    ("06", [P("B", 5.8, 8.4, 0.6), P("B", 8.4, 12.2, 0.7), P("B", 12.2, 21.6, 1.8), P("T", 2.2, 7.6)], "06", 0.2, 0),
    ("07", [P("B", 22.0, 29.2), P("B", 29.2, 34.2), P("B", 34.2, 38.8, 2.5), P("B", 38.8, 42.4)], "07", 0.2, 0),
    ("08", [P("W", 1.5, 7.6)], "08", 0.3, 0.4),
    ("09", [P(G("ch-decide"), 0, 1.6), P("C", 1.0, 3.6), P("C", 3.6, 6.8, 0.8), P("C", 6.8, 8.8, 0.6), P("C", 8.8, 11.2),
            P("C", 20.0, 24.6, 1.5), P("C", 24.6, 28.7, 2.5), P("C", 28.7, 31.0)], "09", 0.25, 0.3),
    ("10", [P("D", 0.5, 11.5)], "10", 0.3, 0.3),
    ("11", [P(G("s11-architecture"), 0, 99)], "11", 0.4, 0.3),
    ("12", [P(G("s12-outro"), 0, 99)], "12", 0.5, 0.3),
]
# Source times of cursor clicks per take (from frame-difference spikes), for click sounds.
CLICKS = {
    "A": [4.67, 11.3, 15.1],
    "B": [5.43, 12.57, 20.7, 23.85, 29.1, 31.3, 33.93],
    "C": [3.2, 9.2, 20.9, 23.67],
}
MUSIC = ROOT / "audio" / "music" / "vaitsez-trap-beat.mp3"  # "Trap - Trap Beat" by vaitsez, Pixabay licence
TAIL = {"12": 2.2}  # seconds after the VO line ends; default below
DEFAULT_TAIL = 0.35


def dur(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def run(args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def eased(keys, i, off):
    """ffmpeg expression for channel i of the keyframes, as a function of source time (it + off)."""
    t = f"(t+{off:.3f})"
    e = f"{keys[-1][i]}"
    for (t0, *v0), (t1, *v1) in reversed(list(zip(keys, keys[1:]))):
        a, b = v0[i - 1], v1[i - 1]
        if a == b:
            seg = f"{a}"
        else:
            u = f"clip(({t}-{t0})/{t1 - t0:.3f},0,1)"
            seg = f"({a}+({b - a})*{u}*{u}*(3-2*{u}))"
        e = f"if(lt({t},{t1}),{seg},{e})"
    return e


def camera(take, a):
    """Eased zoom/pan: scale the frame up by z (evaluated per frame), then crop a 1080p window.
    (zoompan buffers frames and ran this machine out of memory, so it is not used.)"""
    keys = CAM[take]
    z, cx, cy = eased(keys, 1, a), eased(keys, 2, a), eased(keys, 3, a)
    return (
        f"scale=w='trunc(1920*({z})/2)*2':h=-2:eval=frame:flags=bicubic,"
        f"crop=1920:1080:x='clip(({cx})*({z})-960,0,1920*({z})-1920)':y='clip(({cy})*({z})-540,0,1080*({z})-1080)',"
    )


def build_part(sid, i, src, a, b, speed):
    take = src if isinstance(src, str) else None
    path = TAKES[take] if take else src
    b = min(b, dur(path))
    part = TMP / f"seg{sid}-{i}.mp4"
    cam = camera(take, a) if take else ""
    run([
        "-ss", f"{a}", "-to", f"{b}", "-i", str(path),
        "-vf", f"{cam}setpts=(PTS-STARTPTS)/{speed:.4f},fps=30,scale=1920:1080:flags=lanczos,format=yuv420p",
        "-an", "-c:v", "libx264", "-crf", "14", "-preset", "fast", "-threads", "4", str(part),
    ])
    return part


def build_segment(sid, parts, target):
    """Fit the parts to `target` seconds: recording parts share one speed factor; scenes play at 1x."""
    fixed = sum(min(b, dur(s)) - a for s, a, b, _ in parts if not isinstance(s, str))
    flex = sum((b - a) / sp for s, a, b, sp in parts if isinstance(s, str))
    if flex:
        k = max(0.75, min(3.0, flex / max(target - fixed, 0.5)))
        parts = [(s, a, b, sp * k if isinstance(s, str) else sp) for s, a, b, sp in parts]
    else:  # scene-only segment: cut it to length
        s, a, b, sp = parts[0]
        parts = [(s, a, min(b, a + target, dur(s)), sp)]
    files = [build_part(sid, i, *p) for i, p in enumerate(parts)]
    clicks, off = [], 0.0
    for f, (s_, a, b, sp) in zip(files, parts):
        if isinstance(s_, str):
            clicks += [off + (c - a) / sp for c in CLICKS.get(s_, []) if a <= c < b]
        off += dur(f)
    lst = TMP / f"seg{sid}.txt"
    lst.write_text("".join(f"file '{f}'\n" for f in files))
    joined = TMP / f"seg{sid}-joined.mp4"
    run(["-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(joined)])
    seg = TMP / f"seg{sid}.mp4"
    d = dur(joined)
    pad = max(0.0, target - d)
    run(["-i", str(joined), "-vf", f"tpad=stop_mode=clone:stop_duration={pad:.3f}", "-t", f"{target:.3f}",
         "-c:v", "libx264", "-crf", "14", "-preset", "fast", str(seg)])
    print(f"seg {sid}: target {target:.2f}s, picture {d:.2f}s, held {pad:.2f}s", flush=True)
    return seg, [c for c in clicks if c < target - 0.1]


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
    segs, offsets, sfx, t = [], [], [], 0.0
    for sid, parts, vo, at, fade in SEGMENTS:
        vo_d = dur(VO / f"seg-{vo}.wav")
        target = at + vo_d + TAIL.get(sid, DEFAULT_TAIL)
        seg, seg_clicks = build_segment(sid, parts, target)
        start = t - fade if segs else 0.0
        segs.append((seg, fade, start))
        sfx += [("click", start + c) for c in seg_clicks]
        if fade:
            sfx.append(("whoosh", max(0.0, start - 0.25)))
        offsets.append((start, vo, at, vo_d))
        t = start + target
    total = t

    # Picture: crossfades where a segment asks for one, hard cuts elsewhere.
    inputs, filters, prev = [], [], "n0"
    for i, (seg, fade, start) in enumerate(segs):
        inputs += ["-i", str(seg)]
        filters.append(f"[{i}:v]fps=30,settb=AVTB,setsar=1,format=yuv420p[n{i}]")
        if i == 0:
            continue
        out = f"v{i}"
        if fade:
            filters.append(f"[{prev}][n{i}]xfade=transition=fade:duration={fade}:offset={start:.3f}[{out}]")
        else:
            filters.append(f"[{prev}][n{i}]concat=n=2:v=1:a=0,settb=AVTB[{out}]")
        prev = out
    video = TMP / "video.mp4"
    run([*inputs, "-filter_complex", ";".join(filters), "-map", f"[{prev}]", "-c:v", "libx264", "-crf", "14",
         "-preset", "fast", "-threads", "4", "-pix_fmt", "yuv420p", str(video)])

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

    # Sound effects, synthesised: a soft UI tick and an airy whoosh.
    click, whoosh = TMP / "click.wav", TMP / "whoosh.wav"
    run(["-f", "lavfi", "-i", "aevalsrc='0.5*sin(2*PI*2400*t)*exp(-t*220)+0.25*(random(0)*2-1)*exp(-t*400)':d=0.08:s=48000",
         "-af", "highpass=f=900,lowpass=f=9000", "-ac", "2", str(click)])
    run(["-f", "lavfi", "-i", "anoisesrc=d=0.9:c=pink:a=0.5:r=48000",
         "-af", "bandpass=f=1400:width_type=o:w=2.5,afade=t=in:d=0.45:curve=qsin,afade=t=out:st=0.45:d=0.45:curve=qsin,volume=0.6",
         "-ac", "2", str(whoosh)])
    inputs, filters = [], []
    for i, (kind, at) in enumerate(sfx):
        inputs += ["-i", str(click if kind == "click" else whoosh)]
        ms = int(at * 1000)
        filters.append(f"[{i}:a]adelay={ms}|{ms}[s{i}]")
    filters.append("".join(f"[s{i}]" for i in range(len(sfx))) +
                   f"amix=inputs={len(sfx)}:normalize=0,volume=0.5,apad=whole_dur={total:.2f}[sfx]")
    sfx_wav = TMP / "sfx.wav"
    run([*inputs, "-filter_complex", ";".join(filters), "-map", "[sfx]", "-ar", "48000", "-ac", "2", str(sfx_wav)])

    # Music bed under everything, ducked whenever the voice speaks.
    mixed = TMP / "mix.wav"
    run([
        "-i", str(audio), "-i", str(MUSIC), "-i", str(sfx_wav), "-filter_complex",
        "[0:a]asplit=2[vo][key];"
        f"[1:a]atrim=0:{total:.2f},asetpts=N/SR/TB,aresample=48000,aformat=channel_layouts=stereo,highpass=f=50,"
        f"volume=-16dB,afade=t=in:d=0.6,afade=t=out:st={total - 2.5:.2f}:d=2.5[m];"
        "[m][key]sidechaincompress=threshold=0.025:ratio=6:attack=20:release=450[md];"
        "[vo][md][2:a]amix=inputs=3:normalize=0,alimiter=limit=0.9[out]",
        "-map", "[out]", "-ar", "48000", "-ac", "2", str(mixed),
    ])

    final = OUT / "counterclaim-demo.mp4"
    run([
        "-i", str(video), "-i", str(mixed),
        "-vf", f"ass={ass}",
        "-c:v", "libx264", "-crf", "21", "-preset", "medium", "-threads", "4", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(final),
    ])
    print(f"{final}  {dur(final):.1f}s")


if __name__ == "__main__":
    main()
