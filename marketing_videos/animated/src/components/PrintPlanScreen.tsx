import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const LINES = ["Day 1 — Arrival, Ueno Riverside Inn", "Day 2 — Senso-ji, Ginza shopping", "Day 3 — Departure, 11:00 checkout"];

export const PrintPlanScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });
  const pageIn = spring({ frame: local - 20, fps, config: { damping: 16 } });

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <AppHeader />
      <div style={{ padding: "24px 26px", flex: 1 }}>
        <div
          style={{
            opacity: headingIn,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 22,
            color: theme.ink,
            marginBottom: 18,
          }}
        >
          🖨️ Print your itinerary
        </div>

        <div
          style={{
            opacity: pageIn,
            transform: `translateY(${interpolate(pageIn, [0, 1], [24, 0])}px) scale(${interpolate(pageIn, [0, 1], [0.96, 1])})`,
            background: "#ffffff",
            borderRadius: 10,
            padding: 20,
            boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
          }}
        >
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 16, color: "#111", marginBottom: 12 }}>
            Tokyo Trip — 3 nights
          </div>
          {LINES.map((line, i) => {
            const lineIn = spring({ frame: local - 40 - i * 18, fps, config: { damping: 15 } });
            if (lineIn <= 0.01) return null;
            return (
              <div
                key={line}
                style={{
                  opacity: lineIn,
                  fontFamily: FONT,
                  fontSize: 13,
                  color: "#333",
                  marginBottom: 8,
                  borderLeft: `2px solid ${theme.accentSolid}`,
                  paddingLeft: 10,
                }}
              >
                {line}
              </div>
            );
          })}
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
            A clean, paper-ready page - no ads, no clutter, just your plan.
          </div>
        )}
      </div>
    </div>
  );
};
