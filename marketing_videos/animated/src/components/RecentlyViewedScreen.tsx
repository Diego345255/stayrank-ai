import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const HOTELS = [
  { name: "Ueno Riverside Inn", note: "Viewed 2 hours ago" },
  { name: "Sakura Garden Hotel", note: "Viewed yesterday" },
  { name: "Ginza Central", note: "Viewed 3 days ago" },
];

export const RecentlyViewedScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
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
          🕘 Recently viewed
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {HOTELS.map((h, i) => {
            const inAnim = spring({ frame: local - 24 - i * 22, fps, config: { damping: 16 } });
            if (inAnim <= 0.01) return null;
            return (
              <div
                key={h.name}
                style={{
                  opacity: inAnim,
                  transform: `translateX(${interpolate(inAnim, [0, 1], [-30, 0])}px)`,
                  background: theme.card,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 14,
                  padding: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: theme.soft,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                  }}
                >
                  🏨
                </div>
                <div>
                  <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: theme.ink }}>
                    {h.name}
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 12, color: theme.muted, marginTop: 2 }}>
                    {h.note}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {local > 120 && (
          <div
            style={{
              marginTop: 24,
              opacity: interpolate(local, [120, 140], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 16,
              color: theme.muted,
              lineHeight: 1.4,
            }}
          >
            Pick up right where you left off - no re-searching from scratch.
          </div>
        )}
      </div>
    </div>
  );
};
