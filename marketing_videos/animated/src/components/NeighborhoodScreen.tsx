import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const OPTIONS = [
  { name: "All neighborhoods", n: null, active: false },
  { name: "Akihabara", n: 2, active: false },
  { name: "Shinjuku", n: 2, active: true },
  { name: "Ginza / Yurakucho", n: 2, active: false },
  { name: "Ueno / Okachimachi", n: 2, active: false },
];

export const NeighborhoodScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });
  const resultIn = spring({ frame: local - 150, fps, config: { damping: 15 } });

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
            marginBottom: 20,
          }}
        >
          Neighborhood
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            background: theme.paper,
            borderRadius: 20,
            padding: 10,
            border: `1px solid ${theme.line}`,
          }}
        >
          {OPTIONS.map((opt, i) => {
            const inAnim = spring({ frame: local - 20 - i * 16, fps, config: { damping: 16 } });
            if (inAnim <= 0.01) return null;
            return (
              <div
                key={opt.name}
                style={{
                  opacity: inAnim,
                  transform: `translateX(${interpolate(inAnim, [0, 1], [-24, 0])}px)`,
                  padding: "14px 18px",
                  borderRadius: 14,
                  background: opt.active ? theme.accentTint : "transparent",
                  border: opt.active ? `2px solid ${theme.accentStrong}` : "2px solid transparent",
                  fontFamily: FONT,
                  fontWeight: opt.active ? 800 : 600,
                  fontSize: 20,
                  color: opt.active ? theme.accentSolid : theme.ink,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{opt.name}</span>
                {opt.n != null && <span style={{ color: theme.muted }}>({opt.n})</span>}
              </div>
            );
          })}
        </div>

        {resultIn > 0.01 && (
          <div
            style={{
              marginTop: 26,
              opacity: resultIn,
              transform: `translateY(${interpolate(resultIn, [0, 1], [30, 0])}px)`,
              fontFamily: FONT,
              fontSize: 19,
              color: theme.ink,
              background: theme.greenTint,
              borderRadius: 16,
              padding: 18,
              fontWeight: 700,
            }}
          >
            2 real hotels in Shinjuku — narrowed instantly, no scrolling the whole city.
          </div>
        )}
      </div>
    </div>
  );
};
