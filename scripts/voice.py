"""Records the summary the landing page reads aloud, once, so the page plays a clip instead of calling a speech service.

Usage: npm run voice            (writes the words first, then runs this)
Needs: pip install kokoro soundfile, and espeak-ng and ffmpeg on the path.

The voice is Kokoro-82M (Apache-2.0), run on this machine. Each clip is stored with the exact words it speaks;
the page plays a clip only while its own words still match, and falls back to the browser's voice when they do not.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parent.parent
TEXT = json.loads((ROOT / "data-raw" / "voice" / "text.json").read_text())
OUT = ROOT / "public" / "audio"
OUT.mkdir(parents=True, exist_ok=True)

# language code and voice per page language; override with: voice.py en=bf_emma hi=hm_omega
VOICES = {"en": ("b", "bf_emma"), "hi": ("h", "hf_beta")}
for arg in sys.argv[1:]:
    lang, voice = arg.split("=")
    VOICES[lang] = (VOICES[lang][0] if voice[0] == VOICES[lang][1][0] else voice[0], voice)

index = {}
for lang, (code, voice) in VOICES.items():
    pipeline = KPipeline(lang_code=code, repo_id="hexgrad/Kokoro-82M")
    # one sentence at a time, with a short breath between them
    pieces = []
    for _, _, audio in pipeline(TEXT[lang], voice=voice, speed=0.94, split_pattern=r"(?<=[.।])\s+"):
        pieces.append(np.asarray(audio, dtype=np.float32))
        pieces.append(np.zeros(int(24000 * 0.28), dtype=np.float32))
    wav = ROOT / "data-raw" / "voice" / f"hero-{lang}.wav"
    sf.write(wav, np.concatenate(pieces[:-1]), 24000)
    mp3 = OUT / f"hero-{lang}.mp3"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-af", "loudnorm=I=-17:TP=-1.5", "-ac", "1", "-ar", "24000", "-b:a", "64k", str(mp3)], check=True)
    index[lang] = {"text": TEXT[lang], "src": f"/audio/hero-{lang}.mp3", "voice": f"Kokoro-82M {voice}"}
    print(f"{lang}: {voice} -> {mp3.relative_to(ROOT)} ({mp3.stat().st_size // 1024} KB)")

(ROOT / "src" / "samples" / "voice.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n")
