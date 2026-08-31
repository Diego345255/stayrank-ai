import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const PHRASES = [
  { lang: "English", text: "Quiet hotel near the subway" },
  { lang: "Español", text: "Hotel tranquilo cerca del metro" },
  { lang: "Français", text: "Hôtel calme près du métro" },
  { lang: "中文", text: "地铁附近的安静酒店" },
];

export const LanguageScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const cycleLen = 78;
  const idx = Math.min(PHRASES.length - 1, Math.floor(local / cycleLen));
  const withinCycle = local - idx * cycleLen;
  const swapIn = spring({ frame: withinCycle, fps, config: { damping: 18 } });

  const current = PHRASES[idx];

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <AppHeader />
      <div style={{ padding: "30px 28px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            opacity: headingIn,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 26,
            color: theme.ink,
            marginBottom: 26,
          }}
        >
          Search in your language
        </div>

        <div
          style={{
            opacity: swapIn,
            transform: `translateY(${interpolate(swapIn, [0, 1], [16, 0])}px)`,
            background: theme.paper,
            border: `2px solid ${theme.accentStrong}`,
            borderRadius: 20,
            padding: 24,
            boxShadow: "0 10px 30px rgba(109,40,217,0.12)",
          }}
        >
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 16,
              color: theme.accentSolid,
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            {current.lang}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 26, color: theme.ink, fontWeight: 700 }}>
            {current.text}
          </div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", gap: 10, justifyContent: "center" }}>
          {PHRASES.map((p, i) => (
            <div
              key={p.lang}
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: i === idx ? theme.accentSolid : theme.line,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
