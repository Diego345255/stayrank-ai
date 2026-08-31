import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig, OffthreadVideo, staticFile, AbsoluteFill } from "remotion";
import { theme, FONT } from "../theme";

export const CTACard: React.FC<{ tagline: string; bgVideo?: string; bgStartFrom?: number }> = ({
  tagline,
  bgVideo = "hotel-bg",
  bgStartFrom = 90,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const in1 = spring({ frame, fps, config: { damping: 15 } });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
        opacity: in1,
        transform: `translateY(${interpolate(in1, [0, 1], [30, 0])}px)`,
        overflow: "hidden",
      }}
    >
      {/* Same real Pixabay clip as HookCard (see there for the rotation
          rationale), offset to a later section for visual variety between
          the two cards - bgStartFrom is clip-specific so a short source
          (city-bg is only ~152 frames) never runs out of footage before
          the CTA card's own hold ends. */}
      <AbsoluteFill>
        <OffthreadVideo
          src={staticFile(`video/${bgVideo}.mp4`)}
          muted
          startFrom={bgStartFrom}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(160deg, ${theme.accentSolid}e6 0%, #4c1d95d9 100%)`,
        }}
      />
      {/* Explicit z-index, not just DOM order: a positioned element with
          z-index:auto (the AbsoluteFills above) paints above a static
          in-flow element per CSS stacking rules regardless of source
          order - without this the video/overlay silently covered the
          logo/wordmark/tagline entirely. */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: 100,
          height: 100,
          borderRadius: 26,
          background: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 52,
          color: theme.accentSolid,
        }}
      >
        S
      </div>
      <div style={{ position: "relative", zIndex: 1, fontFamily: FONT, fontWeight: 900, fontSize: 56, color: "white" }}>
        StayRank AI
      </div>
      <div
        style={{
          position: "relative",
          zIndex: 1,
          fontFamily: FONT,
          fontWeight: 600,
          fontSize: 26,
          color: "rgba(255,255,255,0.88)",
          textAlign: "center",
          maxWidth: 560,
          lineHeight: 1.4,
        }}
      >
        {tagline}
      </div>
    </div>
  );
};
