import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const HOTELS = [
  { name: "Ueno Riverside Inn", label: "Likely quiet", detail: "0 nightlife venues nearby, no major road", tone: "green" },
  { name: "Ginza Central", label: "Likely lively", detail: "4 bars/clubs nearby, on a major road", tone: "amber" },
];

export const NoiseContextScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });

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
          🔊 Quiet or lively?
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {HOTELS.map((h, i) => {
            const inAnim = spring({ frame: local - 26 - i * 34, fps, config: { damping: 15 } });
            if (inAnim <= 0.01) return null;
            const tint = h.tone === "green" ? theme.greenTint : theme.amberTint;
            const text = h.tone === "green" ? theme.greenText : theme.amber;
            return (
              <div
                key={h.name}
                style={{
                  opacity: inAnim,
                  transform: `translateY(${interpolate(inAnim, [0, 1], [26, 0])}px)`,
                  background: theme.card,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 16,
                  padding: 16,
                }}
              >
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 17, color: theme.ink, marginBottom: 8 }}>
                  {h.name}
                </div>
                <div
                  style={{
                    display: "inline-block",
                    fontFamily: FONT,
                    fontWeight: 700,
                    fontSize: 13,
                    color: text,
                    background: tint,
                    borderRadius: 999,
                    padding: "4px 12px",
                    marginBottom: 8,
                  }}
                >
                  {h.label}
                </div>
                <div style={{ fontFamily: FONT, fontSize: 13, color: theme.muted }}>{h.detail}</div>
              </div>
            );
          })}
        </div>

        {local > 130 && (
          <div
            style={{
              marginTop: 24,
              opacity: interpolate(local, [130, 150], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 16,
              color: theme.muted,
              lineHeight: 1.4,
            }}
          >
            Computed from real nearby nightlife venues and roads - not a vibe guess.
          </div>
        )}
      </div>
    </div>
  );
};
