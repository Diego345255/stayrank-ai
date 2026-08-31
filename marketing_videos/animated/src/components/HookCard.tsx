import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig, OffthreadVideo, staticFile, AbsoluteFill } from "remotion";
import { theme, FONT } from "../theme";

export const HookCard: React.FC<{ text: string; bgVideo?: string }> = ({ text, bgVideo = "hotel-bg" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const in1 = spring({ frame, fps, config: { damping: 14 } });
  const fadeOut = interpolate(frame, [46, 58], [1, 0], { extrapolateLeft: "clamp" });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 90,
        opacity: fadeOut,
        overflow: "hidden",
      }}
    >
      {/* Real royalty-free footage via Pixabay (free for commercial use,
          credited in the YouTube description anyway) - adds real motion
          behind the hook line instead of a flat gradient, dimmed under a
          brand-tinted overlay so the bold white text stays fully legible.
          Rotates across 3 clips (hotel/beach/city) by variant so the whole
          batch doesn't look identical back-to-back on a channel. */}
      <AbsoluteFill>
        <OffthreadVideo
          src={staticFile(`video/${bgVideo}.mp4`)}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(160deg, ${theme.ink}e6 0%, #3a2440d9 100%)`,
        }}
      />
      {/* Explicit z-index (see CTACard's identical fix) so this always
          paints above the AbsoluteFill video/overlay regardless of
          stacking-order edge cases. */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          opacity: in1,
          transform: `scale(${interpolate(in1, [0, 1], [0.85, 1])})`,
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 58,
          color: "white",
          textAlign: "center",
          lineHeight: 1.25,
        }}
      >
        {text}
      </div>
    </div>
  );
};
