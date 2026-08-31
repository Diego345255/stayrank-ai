"""Converts each video's real edge-tts caption-cue JSON (public/audio/<id>.words.json)
into a standard .srt subtitle file - an open, widely-supported format any video
platform (YouTube, Vimeo, etc.) can attach as an accessibility caption track.

Improves accessibility (deaf/hard-of-hearing viewers, non-native speakers) and
YouTube's search indexing (captions are indexed as searchable text) - built from
data already captured live from edge-tts, not re-generated or guessed.
"""
import glob
import json
import os


def ms_to_srt_time(ms: float) -> str:
    total_ms = round(ms)
    hours, rem = divmod(total_ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    seconds, millis = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def convert(path: str) -> None:
    with open(path, encoding="utf-8") as f:
        cues = json.load(f)
    name = os.path.basename(path).replace(".words.json", "")
    out_path = os.path.join("out", "captions", f"{name}.srt")
    with open(out_path, "w", encoding="utf-8") as f:
        for i, cue in enumerate(cues, start=1):
            f.write(f"{i}\n")
            f.write(f"{ms_to_srt_time(cue['startMs'])} --> {ms_to_srt_time(cue['endMs'])}\n")
            f.write(f"{cue['text']}\n\n")
    print(f"{name}: {len(cues)} cues -> {out_path}")


def main() -> None:
    os.makedirs(os.path.join("out", "captions"), exist_ok=True)
    for path in sorted(glob.glob(os.path.join("public", "audio", "*.words.json"))):
        convert(path)


if __name__ == "__main__":
    main()
