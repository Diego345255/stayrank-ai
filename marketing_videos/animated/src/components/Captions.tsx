import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { FONT } from "../theme";

export interface CaptionCue {
  text: string;
  startMs: number;
  endMs: number;
}

// Sentence-level captions, timed from edge-tts's own real SentenceBoundary
// events (see gen_captions.py) - not a guessed even split. Added because
// this tick's research explicitly flagged captions as essential for
// Shorts/TikTok/Instagram, where most viewers watch muted; none of the
// first 8 renders had them.
export const Captions: React.FC<{ cues: CaptionCue[] }> = ({ cues }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;

  const active = cues.find((c) => nowMs >= c.startMs && nowMs < c.endMs);
  if (!active) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 90,
        display: "flex",
        justifyContent: "center",
        padding: "0 60px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: "rgba(10,6,14,0.78)",
          color: "white",
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 32,
          lineHeight: 1.35,
          textAlign: "center",
          padding: "16px 26px",
          borderRadius: 18,
          maxWidth: 900,
        }}
      >
        {active.text}
      </div>
    </div>
  );
};
