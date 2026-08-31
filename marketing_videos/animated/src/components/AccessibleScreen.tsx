import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const HOTELS = [
  { name: "Ueno Riverside Inn", tags: ["Step-free entrance", "Roll-in shower"], ok: true },
  { name: "Ginza Central", tags: ["Elevator access only"], ok: false },
  { name: "Sakura Garden Hotel", tags: ["Step-free entrance", "Accessible bathroom"], ok: true },
];

export const AccessibleScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
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
            ♿ Accessible only
          </div>
          <div
            style={{
              width: 40,
              height: 22,
              borderRadius: 11,
              background: theme.accentSolid,
              position: "relative",
            }}
          >
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
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {h.tags.map((t) => (
                    <span
                      key={t}
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
                      {t}
                    </span>
                  ))}
                </div>
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
            Only hotels with real, listed accessibility features stay - nothing assumed.
          </div>
        )}
      </div>
    </div>
  );
};
