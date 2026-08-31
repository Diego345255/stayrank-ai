import React from "react";
import { AbsoluteFill } from "remotion";
import { theme, FONT } from "../theme";

// YouTube channel art spec: upload at 2560x1440, but only the centered
// 1546x423 "safe area" is guaranteed visible across TV/desktop/mobile crops
// - everything that must actually be read (logo, name, tagline) stays
// inside that zone; the gradient is free to fill the full canvas.
const SAFE_WIDTH = 1546;
const SAFE_HEIGHT = 423;

export const ChannelBanner: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(120deg, ${theme.ink} 0%, ${theme.accentSolid} 55%, #4c1d95 100%)`,
      }}
    >
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: SAFE_WIDTH,
            height: SAFE_HEIGHT,
            display: "flex",
            alignItems: "center",
            gap: 48,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 180,
              height: 180,
              borderRadius: 44,
              background: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: 92,
              color: theme.accentSolid,
              flexShrink: 0,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            S
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 96, color: "white", lineHeight: 1 }}>
              StayRank AI
            </div>
            <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 34, color: "rgba(255,255,255,0.88)" }}>
              Hotel rankings from real traveler intent — never a paid placement.
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
