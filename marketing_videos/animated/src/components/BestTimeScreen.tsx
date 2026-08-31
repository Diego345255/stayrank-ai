import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const MONTHS = [
  { m: "Jan", temp: 8, rain: 52 },
  { m: "Feb", temp: 9, rain: 56 },
  { m: "Mar", temp: 13, rain: 118 },
  { m: "Apr", temp: 18, rain: 125 },
  { m: "May", temp: 22, rain: 138 },
  { m: "Jun", temp: 25, rain: 168 },
];

export const BestTimeScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });
  const maxTemp = Math.max(...MONTHS.map((m) => m.temp));

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
          Best time to visit
        </div>
        <div style={{ opacity: headingIn, fontFamily: FONT, fontSize: 14, color: theme.muted, marginBottom: 22 }}>
          3-year historical average, by month
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 150 }}>
          {MONTHS.map((mo, i) => {
            const barIn = spring({ frame: local - 30 - i * 8, fps, config: { damping: 14 } });
            const h = (mo.temp / maxTemp) * 130 * barIn;
            const isMildest = mo.m === "Mar";
            return (
              <div key={mo.m} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                <div
                  style={{
                    width: "100%",
                    height: Math.max(h, 0),
                    borderRadius: "6px 6px 0 0",
                    background: isMildest ? theme.accentSolid : theme.soft,
                    border: isMildest ? "none" : `1px solid ${theme.border}`,
                  }}
                />
                <div style={{ fontFamily: FONT, fontSize: 11, color: theme.muted, marginTop: 6 }}>{mo.m}</div>
              </div>
            );
          })}
        </div>

        {local > 100 && (
          <div
            style={{
              marginTop: 24,
              opacity: interpolate(local, [100, 120], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 15,
              color: theme.accentSolid,
            }}
          >
            🌤️ March — mildest, driest of the six shown
          </div>
        )}

        {local > 140 && (
          <div
            style={{
              marginTop: 12,
              opacity: interpolate(local, [140, 160], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 15,
              color: theme.muted,
              lineHeight: 1.4,
            }}
          >
            Real historical weather - never a made-up crowd or price score.
          </div>
        )}
      </div>
    </div>
  );
};
