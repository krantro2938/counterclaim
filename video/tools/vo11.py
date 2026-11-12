#!/usr/bin/env python3
"""ElevenLabs voice-over: one WAV per line of audio/vo/lines.json, read as one continuous take
(previous_text / next_text keep the delivery flowing across lines).

    ELEVENLABS_API_KEY=… python3 video/tools/vo11.py [--only 04,06]
"""
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

VO = Path(__file__).resolve().parents[1] / "audio" / "vo"
VOICE = "EXAVITQu4vr4xnSDxMaL"  # Sarah
MODEL = "eleven_multilingual_v2"


def speak(text, prev, nxt, out_mp3):
    body = {"text": text, "model_id": MODEL, "previous_text": prev, "next_text": nxt,
            "voice_settings": {"stability": 0.45, "similarity_boost": 0.75, "style": 0.15, "use_speaker_boost": True}}
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}?output_format=mp3_44100_128",
        data=json.dumps(body).encode(), method="POST",
        headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        out_mp3.write_bytes(r.read())


def finish(mp3, wav):
    # trim edge silence, normalise, 80 ms pads so lines can sit close together
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp3), "-af",
                    "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                    "loudnorm=I=-16:TP=-1.5:LRA=11,adelay=80:all=1,apad=pad_dur=0.08",
                    "-ar", "48000", "-ac", "1", str(wav)], check=True)


lines = json.loads((VO / "lines.json").read_text())
only = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else None
for i, (sid, text) in enumerate(lines):
    if only and sid not in only:
        continue
    prev = lines[i - 1][1] if i else ""
    nxt = lines[i + 1][1] if i + 1 < len(lines) else ""
    mp3 = VO / f"seg-{sid}.mp3"
    speak(text, prev, nxt, mp3)
    finish(mp3, VO / f"seg-{sid}.wav")
    d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(VO / f"seg-{sid}.wav")],
                       capture_output=True, text=True).stdout.strip()
    print(sid, d, text[:50])
