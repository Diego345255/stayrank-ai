import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const ROWS = [
  { name: "Ueno Riverside Inn", dist: "0.4 km · 6 min walk" },
  { name: "Asakusa View Hotel", dist: "0.9 km · 12 min walk" },
  { name: "Kanda Grove Hotel", dist: "1.6 km · 21 min walk" },
];

export const LandmarkScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });
  const inputIn = spring({ frame: local - 20, fps, config: { damping: 16 } });

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <AppHeader />
      <div style={{ padding: "26px 28px", flex: 1 }}>
        <div
          style={{
            opacity: headingIn,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 26,
            color: theme.ink,
            marginBottom: 20,
          }}
        >
          📍 Near a landmark
        </div>

        <div
          style={{
            opacity: inputIn,
            background: theme.paper,
            border: `2px solid ${theme.accentStrong}`,
            borderRadius: 16,
            padding: "14px 18px",
            fontFamily: FONT,
            fontSize: 20,
            color: theme.ink,
            fontWeight: 700,
            marginBottom: 20,
          }}
        >
          Senso-ji Temple
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ROWS.map((row, i) => {
            const inAnim = spring({ frame: local - 46 - i * 22, fps, config: { damping: 15 } });
            if (inAnim <= 0.01) return null;
            return (
              <div
                key={row.name}
                style={{
                  opacity: inAnim,
                  transform: `translateY(${interpolate(inAnim, [0, 1], [24, 0])}px)`,
                  background: theme.paper,
                  border: `1px solid ${theme.line}`,
                  borderRadius: 14,
                  padding: 16,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 18, color: theme.ink }}>
                  {row.name}
                </span>
                <span style={{ fontFamily: FONT, fontSize: 15, color: theme.accentSolid, fontWeight: 700 }}>
                  {row.dist}
                </span>
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
            Real walking distance and time, via real routing - not a straight-line guess.
          </div>
        )}
      </div>
    </div>
  );
};
