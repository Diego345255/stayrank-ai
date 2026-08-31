import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const OPTIONS = [
  { icon: "📅", label: "Add to Calendar", sub: ".ics file - check-in & check-out" },
  { icon: "🗺️", label: "Open in Maps", sub: ".kml file - every shortlisted hotel" },
];

export const ExportScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
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
          Export your trip
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {OPTIONS.map((opt, i) => {
            const inAnim = spring({ frame: local - 26 - i * 28, fps, config: { damping: 15 } });
            if (inAnim <= 0.01) return null;
            const pulse = local > 60 + i * 28 ? Math.sin((local - 60 - i * 28) / 6) * 2 : 0;
            return (
              <div
                key={opt.label}
                style={{
                  opacity: inAnim,
                  transform: `translateY(${interpolate(inAnim, [0, 1], [26, 0])}px) translateY(${i === 0 ? pulse : 0}px)`,
                  background: theme.card,
                  border: `1.5px solid ${theme.accentSolid}`,
                  borderRadius: 16,
                  padding: 18,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <span style={{ fontSize: 28 }}>{opt.icon}</span>
                <div>
                  <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 18, color: theme.ink }}>
                    {opt.label}
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 13, color: theme.muted, marginTop: 2 }}>
                    {opt.sub}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {local > 120 && (
          <div
            style={{
              marginTop: 26,
              opacity: interpolate(local, [120, 140], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 17,
              color: theme.muted,
              lineHeight: 1.4,
            }}
          >
            Standard files - open in any calendar or maps app you already use.
          </div>
        )}
      </div>
    </div>
  );
};
