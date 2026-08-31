import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const CHIPS = [
  { icon: "☀️", label: "22°C · Sunny", tone: "amber" as const },
  { icon: "🏛️", label: "Senso-ji Temple · 8 min walk", tone: "green" as const },
  { icon: "✈️", label: "$540–780 · 11h flight", tone: "accent" as const },
];

export const TripPlanScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <AppHeader />
      <div style={{ padding: "30px 28px", flex: 1 }}>
        <div
          style={{
            opacity: headingIn,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 26,
            color: theme.ink,
            marginBottom: 6,
          }}
        >
          Trip Planner Pro
        </div>
        <div
          style={{
            opacity: headingIn,
            fontFamily: FONT,
            fontSize: 17,
            color: theme.muted,
            marginBottom: 24,
          }}
        >
          Real data, never a guess
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {CHIPS.map((chip, i) => {
            const inAnim = spring({ frame: local - 24 - i * 22, fps, config: { damping: 15 } });
            if (inAnim <= 0.01) return null;
            const bg =
              chip.tone === "amber" ? theme.amberTint : chip.tone === "green" ? theme.greenTint : theme.accentTint;
            const fg = chip.tone === "amber" ? theme.amber : chip.tone === "green" ? theme.greenText : theme.accentSolid;
            return (
              <div
                key={chip.label}
                style={{
                  opacity: inAnim,
                  transform: `translateY(${interpolate(inAnim, [0, 1], [26, 0])}px)`,
                  background: bg,
                  color: fg,
                  fontFamily: FONT,
                  fontWeight: 800,
                  fontSize: 21,
                  padding: "18px 20px",
                  borderRadius: 18,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 26 }}>{chip.icon}</span>
                {chip.label}
              </div>
            );
          })}
        </div>

        {local > 130 && (
          <div
            style={{
              marginTop: 28,
              opacity: interpolate(local, [130, 150], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 18,
              color: theme.ink,
              lineHeight: 1.4,
            }}
          >
            Weather from Open-Meteo, places from OpenStreetMap, flight estimate from real
            distance — clearly labeled as an estimate, never a fake live quote.
          </div>
        )}
      </div>
    </div>
  );
};
