import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const STOPS = [
  { name: "Ueno Station", type: "Subway", dist: "0.3 km" },
  { name: "Keisei Ueno", type: "Rail", dist: "0.5 km" },
];

export const TransitScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
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
            fontSize: 22,
            color: theme.ink,
            marginBottom: 4,
          }}
        >
          Nearest transit
        </div>
        <div style={{ opacity: headingIn, fontFamily: FONT, fontSize: 14, color: theme.muted, marginBottom: 22 }}>
          Ueno Riverside Inn
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {STOPS.map((s, i) => {
            const rowIn = spring({ frame: local - 26 - i * 26, fps, config: { damping: 15 } });
            if (rowIn <= 0.01) return null;
            return (
              <div
                key={s.name}
                style={{
                  opacity: rowIn,
                  transform: `translateX(${interpolate(rowIn, [0, 1], [-30, 0])}px)`,
                  background: theme.card,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 14,
                  padding: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: theme.accentSolid,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                  }}
                >
                  🚇
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: theme.ink }}>
                    {s.name}
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 12, color: theme.muted, marginTop: 2 }}>
                    {s.type}
                  </div>
                </div>
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: theme.accentSolid }}>
                  {s.dist}
                </div>
              </div>
            );
          })}
        </div>

        {local > 110 && (
          <div
            style={{
              marginTop: 24,
              opacity: interpolate(local, [110, 130], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 16,
              color: theme.muted,
              lineHeight: 1.4,
            }}
          >
            The real, named nearest station - not just a 76/100 transit score.
          </div>
        )}
      </div>
    </div>
  );
};
