import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const HOTELS = [
  { name: "Ueno Riverside Inn", price: 174, free: true },
  { name: "Ginza Central", price: 226, free: true },
  { name: "Shinjuku Garden Hotel", price: 158, free: false },
];

export const CancellationScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
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
            marginBottom: 20,
          }}
        >
          Free cancellation, clearly marked
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {HOTELS.map((h, i) => {
            const inAnim = spring({ frame: local - 24 - i * 22, fps, config: { damping: 15 } });
            if (inAnim <= 0.01) return null;
            return (
              <div
                key={h.name}
                style={{
                  opacity: inAnim,
                  transform: `translateY(${interpolate(inAnim, [0, 1], [26, 0])}px)`,
                  background: theme.paper,
                  border: `1px solid ${theme.line}`,
                  borderRadius: 16,
                  padding: 18,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 19, color: theme.ink }}>
                    {h.name}
                  </span>
                  <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 19, color: theme.ink }}>
                    ${h.price}
                  </span>
                </div>
                {h.free && (
                  <div
                    style={{
                      marginTop: 8,
                      display: "inline-block",
                      background: theme.greenTint,
                      color: theme.greenText,
                      fontFamily: FONT,
                      fontWeight: 800,
                      fontSize: 15,
                      padding: "5px 12px",
                      borderRadius: 999,
                    }}
                  >
                    ✓ Free cancellation
                  </div>
                )}
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
            Only shown when the real Booking.com policy actually confirms it - never assumed.
          </div>
        )}
      </div>
    </div>
  );
};
