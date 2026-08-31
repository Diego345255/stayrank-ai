import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const CITIES = ["Tokyo", "Kyoto", "Osaka", "Sapporo"];

export const RecentCitiesScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
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
            marginBottom: 6,
          }}
        >
          Recently searched
        </div>
        <div style={{ opacity: headingIn, fontFamily: FONT, fontSize: 14, color: theme.muted, marginBottom: 24 }}>
          Jump back in - one tap
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {CITIES.map((city, i) => {
            const chipIn = spring({ frame: local - 26 - i * 14, fps, config: { damping: 15 } });
            if (chipIn <= 0.01) return null;
            return (
              <div
                key={city}
                style={{
                  opacity: chipIn,
                  transform: `scale(${interpolate(chipIn, [0, 1], [0.7, 1])})`,
                  background: theme.card,
                  border: `1.5px solid ${theme.accentSolid}`,
                  borderRadius: 999,
                  padding: "10px 18px",
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: 15,
                  color: theme.accentSolid,
                }}
              >
                {city}
              </div>
            );
          })}
        </div>

        {local > 110 && (
          <div
            style={{
              marginTop: 28,
              opacity: interpolate(local, [110, 130], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 16,
              color: theme.muted,
              lineHeight: 1.4,
            }}
          >
            Only cities you actually searched - never a fabricated "trending" list.
          </div>
        )}
      </div>
    </div>
  );
};
