import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const HOTELS = [
  { name: "Ueno Riverside Inn", note: "Dogs & cats welcome, no fee", ok: true },
  { name: "Sakura Garden Hotel", note: "Pets under 10kg, fee applies", ok: true },
  { name: "Ginza Central", note: "No pets", ok: false },
];

export const PetFriendlyScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const toggleIn = spring({ frame: local - 4, fps, config: { damping: 18 } });

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <AppHeader />
      <div style={{ padding: "22px 24px", flex: 1 }}>
        <div
          style={{
            opacity: toggleIn,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: 14,
            padding: "12px 16px",
            marginBottom: 18,
          }}
        >
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: theme.ink }}>
            🐾 Pet-friendly only
          </div>
          <div style={{ width: 40, height: 22, borderRadius: 11, background: theme.accentSolid, position: "relative" }}>
            <div
              style={{
                position: "absolute",
                top: 2,
                left: interpolate(toggleIn, [0, 1], [2, 20]),
                width: 18,
                height: 18,
                borderRadius: 9,
                background: "#fff",
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {HOTELS.map((h, i) => {
            const rowIn = spring({ frame: local - 22 - i * 20, fps, config: { damping: 16 } });
            if (rowIn <= 0.01) return null;
            const filtered = !h.ok && local > 95;
            return (
              <div
                key={h.name}
                style={{
                  opacity: rowIn * (filtered ? interpolate(local, [95, 115], [1, 0.25], { extrapolateRight: "clamp" }) : 1),
                  transform: `translateY(${interpolate(rowIn, [0, 1], [20, 0])}px) scale(${filtered ? interpolate(local, [95, 115], [1, 0.94], { extrapolateRight: "clamp" }) : 1})`,
                  background: theme.card,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: theme.ink, marginBottom: 6 }}>
                  {h.name}
                </div>
                <span
                  style={{
                    fontFamily: FONT,
                    fontSize: 12,
                    fontWeight: 600,
                    color: h.ok ? theme.greenText : theme.muted,
                    background: h.ok ? theme.greenTint : theme.soft,
                    borderRadius: 999,
                    padding: "4px 10px",
                  }}
                >
                  {h.note}
                </span>
              </div>
            );
          })}
        </div>

        {local > 130 && (
          <div
            style={{
              marginTop: 22,
              opacity: interpolate(local, [130, 150], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 16,
              color: theme.muted,
              lineHeight: 1.4,
            }}
          >
            Real pet policies, pulled straight from the listing - never guessed.
          </div>
        )}
      </div>
    </div>
  );
};
