import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const ROWS = [
  { name: "Ueno Riverside Inn", city: "Tokyo", was: 191, now: 174 },
  { name: "Shinjuku Garden Hotel", city: "Tokyo", was: 158, now: 158 },
  { name: "Ginza Central", city: "Tokyo", was: 210, now: 226 },
];

export const PriceWatchScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <AppHeader />
      <div style={{ padding: "30px 28px", flex: 1 }}>
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
          📉 Price watches
        </div>
        <div
          style={{
            opacity: headingIn,
            fontFamily: FONT,
            fontSize: 17,
            color: theme.muted,
            marginBottom: 22,
          }}
        >
          A real observed change — never a prediction, never sent to you
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {ROWS.map((row, i) => {
            const inAnim = spring({ frame: local - 24 - i * 20, fps, config: { damping: 15 } });
            if (inAnim <= 0.01) return null;
            const diff = row.now - row.was;
            const cheaper = diff < 0;
            const noChange = diff === 0;
            return (
              <div
                key={row.name}
                style={{
                  opacity: inAnim,
                  transform: `translateX(${interpolate(inAnim, [0, 1], [-30, 0])}px)`,
                  background: theme.paper,
                  border: `1px solid ${theme.line}`,
                  borderRadius: 16,
                  padding: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 19, color: theme.ink }}>
                    {row.name}
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 15, color: theme.muted }}>
                    {row.city} · first seen ${row.was}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 21, color: theme.ink }}>
                    ${row.now}
                  </div>
                  {!noChange && (
                    <div
                      style={{
                        fontFamily: FONT,
                        fontWeight: 800,
                        fontSize: 15,
                        color: cheaper ? theme.greenText : theme.amber,
                      }}
                    >
                      {cheaper ? "▼" : "▲"} ${Math.abs(diff)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
