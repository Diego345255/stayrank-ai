import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const CERTS = [
  { name: "Green Key", level: "Certified" },
  { name: "EarthCheck", level: "Silver" },
];

export const SustainabilityScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
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
            fontSize: 26,
            color: theme.ink,
            marginBottom: 6,
          }}
        >
          🌱 Sustainability
        </div>
        <div
          style={{
            opacity: headingIn,
            fontFamily: FONT,
            fontSize: 16,
            color: theme.muted,
            marginBottom: 22,
          }}
        >
          Ueno Riverside Inn
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {CERTS.map((cert, i) => {
            const inAnim = spring({ frame: local - 26 - i * 24, fps, config: { damping: 15 } });
            if (inAnim <= 0.01) return null;
            return (
              <div
                key={cert.name}
                style={{
                  opacity: inAnim,
                  transform: `translateY(${interpolate(inAnim, [0, 1], [26, 0])}px)`,
                  background: theme.greenTint,
                  borderRadius: 16,
                  padding: 18,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <span style={{ fontSize: 30 }}>🏅</span>
                <div>
                  <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 19, color: theme.greenText }}>
                    {cert.name}
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 15, color: theme.greenText, opacity: 0.85 }}>
                    {cert.level}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {local > 110 && (
          <div
            style={{
              marginTop: 26,
              opacity: interpolate(local, [110, 130], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 17,
              color: theme.muted,
              lineHeight: 1.4,
            }}
          >
            Real, third-party certifications only - never a fabricated "eco-score."
          </div>
        )}
      </div>
    </div>
  );
};
