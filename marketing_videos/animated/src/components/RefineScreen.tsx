import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

export const RefineScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });
  const chipIn = spring({ frame: local - 40, fps, config: { damping: 15 } });
  const rerankIn = spring({ frame: local - 70, fps, config: { damping: 15 } });

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <AppHeader />
      <div style={{ padding: "26px 28px", flex: 1 }}>
        <div
          style={{
            opacity: headingIn,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 22,
            color: theme.ink,
            marginBottom: 20,
          }}
        >
          Refine your search
        </div>

        <div
          style={{
            opacity: headingIn,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: theme.soft,
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            padding: "10px 14px",
            marginBottom: 16,
          }}
        >
          <span style={{ fontFamily: FONT, fontSize: 14, color: theme.muted }}>
            "closer to the station"
          </span>
        </div>

        <div
          style={{
            opacity: chipIn,
            transform: `scale(${interpolate(chipIn, [0, 1], [0.7, 1])})`,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: theme.accentSolid,
            borderRadius: 999,
            padding: "8px 14px",
            marginBottom: 24,
          }}
        >
          <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: "#fff" }}>
            closer to the station
          </span>
          <span style={{ color: "#fff", opacity: 0.7 }}>×</span>
        </div>

        <div
          style={{
            opacity: rerankIn,
            transform: `translateY(${interpolate(rerankIn, [0, 1], [16, 0])}px)`,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 15,
            color: theme.greenText,
          }}
        >
          ✓ Same real hotels, re-ranked instantly
        </div>

        {local > 130 && (
          <div
            style={{
              marginTop: 22,
              opacity: interpolate(local, [130, 150], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 16,
              color: theme.muted,
              lineHeight: 1.4,
            }}
          >
            No new fetch, no fake results - just a smarter re-rank of what's real.
          </div>
        )}
      </div>
    </div>
  );
};
