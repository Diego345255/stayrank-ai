import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

export const TopMatchScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const cardIn = spring({ frame: local - 6, fps, config: { damping: 16 } });
  const calloutIn = spring({ frame: local - 90, fps, config: { damping: 15 } });

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <AppHeader />
      <div style={{ padding: "30px 28px", flex: 1 }}>
        <div
          style={{
            opacity: cardIn,
            transform: `translateY(${interpolate(cardIn, [0, 1], [30, 0])}px)`,
            background: theme.paper,
            borderRadius: 20,
            border: `1px solid ${theme.line}`,
            boxShadow: "0 14px 34px rgba(42,24,46,0.10)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: 160,
              background: `linear-gradient(135deg, ${theme.accentTint}, ${theme.soft})`,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 16,
                left: 16,
                background: "rgba(42,24,46,0.86)",
                color: "white",
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: 17,
                padding: "6px 14px",
                borderRadius: 999,
              }}
            >
              #1
            </div>
            <div
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: theme.amber,
                color: "white",
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: 16,
                padding: "6px 14px",
                borderRadius: 999,
              }}
            >
              🏆 Top Match
            </div>
          </div>
          <div style={{ padding: 22 }}>
            <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 23, color: theme.ink }}>
              Ueno Riverside Inn
            </div>
            <div style={{ fontFamily: FONT, fontSize: 17, color: theme.muted, marginTop: 6 }}>
              Score 91/100 · Confidence 84%
            </div>
          </div>
        </div>

        {calloutIn > 0.01 && (
          <div
            style={{
              marginTop: 30,
              opacity: calloutIn,
              transform: `translateY(${interpolate(calloutIn, [0, 1], [30, 0])}px)`,
              background: theme.ink,
              color: "white",
              borderRadius: 18,
              padding: 22,
              fontFamily: FONT,
              fontSize: 20,
              lineHeight: 1.45,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 6, color: theme.accentStrong }}>
              Not a paid placement.
            </div>
            Highest score from our own transparent scoring model — you can inspect every weight
            that went into it.
          </div>
        )}
      </div>
    </div>
  );
};
