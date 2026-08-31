import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const TIERS = [
  { label: "Booking.com", state: "down" },
  { label: "Hotelbeds", state: "down" },
  { label: "Wikidata", state: "up" },
];

export const DataSourceScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
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
            marginBottom: 22,
          }}
        >
          If one source fails...
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {TIERS.map((t, i) => {
            const rowIn = spring({ frame: local - 24 - i * 26, fps, config: { damping: 15 } });
            if (rowIn <= 0.01) return null;
            const isUp = t.state === "up";
            return (
              <div
                key={t.label}
                style={{
                  opacity: rowIn,
                  transform: `translateX(${interpolate(rowIn, [0, 1], [-30, 0])}px)`,
                  background: isUp ? theme.greenTint : theme.soft,
                  border: `1px solid ${isUp ? theme.greenText : theme.border}`,
                  borderRadius: 14,
                  padding: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 20 }}>{isUp ? "✅" : "⚠️"}</span>
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: isUp ? theme.greenText : theme.muted }}>
                  {t.label}
                </div>
                <div style={{ marginLeft: "auto", fontFamily: FONT, fontSize: 12, fontWeight: 600, color: isUp ? theme.greenText : theme.muted }}>
                  {isUp ? "Serving real data" : "Temporarily unavailable"}
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
            Automatically falls back to another real source - never fabricated data.
          </div>
        )}
      </div>
    </div>
  );
};
