import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const ITEMS = [
  { icon: "🧴", label: "Sunscreen — UV index runs high this week" },
  { icon: "🌂", label: "Umbrella — rain likely on 2 of 5 days" },
  { icon: "🧥", label: "Light jacket — evenings drop to 14°C" },
];

export const PackingScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
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
          🎒 Smart packing list
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
          Built from the real forecast, not a generic checklist
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {ITEMS.map((item, i) => {
            const inAnim = spring({ frame: local - 24 - i * 26, fps, config: { damping: 15 } });
            if (inAnim <= 0.01) return null;
            return (
              <div
                key={item.label}
                style={{
                  opacity: inAnim,
                  transform: `translateX(${interpolate(inAnim, [0, 1], [-30, 0])}px)`,
                  background: theme.paper,
                  border: `1px solid ${theme.line}`,
                  borderRadius: 16,
                  padding: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <span style={{ fontSize: 28 }}>{item.icon}</span>
                <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 17, color: theme.ink, lineHeight: 1.35 }}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>

        {local > 140 && (
          <div
            style={{
              marginTop: 24,
              opacity: interpolate(local, [140, 160], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 16,
              color: theme.muted,
              lineHeight: 1.4,
            }}
          >
            Every reason is a real number - real UV index, real rain chance, real low temperature.
          </div>
        )}
      </div>
    </div>
  );
};
