import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

export const CurrencyScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });
  const cardIn = spring({ frame: local - 24, fps, config: { damping: 15 } });
  const flip = interpolate(local, [70, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <AppHeader />
      <div style={{ padding: "26px 28px", flex: 1 }}>
        <div
          style={{
            opacity: headingIn,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 24,
            color: theme.ink,
            marginBottom: 22,
          }}
        >
          Ueno Riverside Inn
        </div>

        <div
          style={{
            opacity: cardIn,
            transform: `translateY(${interpolate(cardIn, [0, 1], [26, 0])}px)`,
            background: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: 18,
            padding: 24,
            textAlign: "center",
          }}
        >
          <div style={{ fontFamily: FONT, fontSize: 14, color: theme.muted, marginBottom: 8 }}>
            per night
          </div>
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 40, color: theme.ink }}>
            {flip < 0.5 ? "$142" : "¥124,830"}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 13, color: theme.accentSolid, marginTop: 8, fontWeight: 600 }}>
            {flip < 0.5 ? "USD" : "Live JPY - today's ECB rate"}
          </div>
        </div>

        {local > 130 && (
          <div
            style={{
              marginTop: 26,
              opacity: interpolate(local, [130, 150], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 17,
              color: theme.muted,
              lineHeight: 1.4,
            }}
          >
            Real daily exchange rates - never a stale or made-up conversion.
          </div>
        )}
      </div>
    </div>
  );
};
