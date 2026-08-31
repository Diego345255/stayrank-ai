import React from "react";
import { interpolate, useCurrentFrame, spring, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const PROMPT =
  "Quiet hotel near the subway, good for a couple, budget under $190/night";

export const SearchScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const charsToShow = Math.max(0, Math.min(PROMPT.length, Math.floor((local - 6) * 1.6)));
  const typed = PROMPT.slice(0, charsToShow);

  const cardIn = spring({ frame: local - 62, fps, config: { damping: 16 } });

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <AppHeader />
      <div style={{ padding: "30px 28px", flex: 1 }}>
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 20,
            color: theme.muted,
            marginBottom: 14,
          }}
        >
          Describe your trip
        </div>
        <div
          style={{
            background: theme.paper,
            border: `2px solid ${theme.accentStrong}`,
            borderRadius: 20,
            padding: 22,
            fontFamily: FONT,
            fontSize: 24,
            color: theme.ink,
            minHeight: 150,
            lineHeight: 1.4,
            boxShadow: "0 10px 30px rgba(109,40,217,0.12)",
          }}
        >
          {typed}
          <span style={{ opacity: local % 20 < 10 ? 1 : 0, color: theme.accentSolid }}>|</span>
        </div>

        {cardIn > 0.02 && (
          <div
            style={{
              marginTop: 34,
              opacity: cardIn,
              transform: `translateY(${interpolate(cardIn, [0, 1], [40, 0])}px)`,
            }}
          >
            <div
              style={{
                background: theme.paper,
                borderRadius: 20,
                border: `1px solid ${theme.line}`,
                boxShadow: "0 14px 34px rgba(42,24,46,0.10)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: 150,
                  background: `linear-gradient(135deg, ${theme.accentTint}, ${theme.soft})`,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 14,
                    left: 14,
                    background: "rgba(42,24,46,0.86)",
                    color: "white",
                    fontFamily: FONT,
                    fontWeight: 800,
                    fontSize: 16,
                    padding: "6px 12px",
                    borderRadius: 999,
                  }}
                >
                  #1
                </div>
                <div
                  style={{
                    position: "absolute",
                    top: 14,
                    right: 14,
                    background: theme.amber,
                    color: "white",
                    fontFamily: FONT,
                    fontWeight: 800,
                    fontSize: 15,
                    padding: "5px 12px",
                    borderRadius: 999,
                  }}
                >
                  🏆 Top Match
                </div>
              </div>
              <div style={{ padding: 20 }}>
                <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 22, color: theme.ink }}>
                  Ueno Riverside Inn ★★★★☆
                </div>
                <div style={{ fontFamily: FONT, fontSize: 17, color: theme.muted, marginTop: 6 }}>
                  Ueno · $174/night · 4.6 guest rating
                </div>
                <div
                  style={{
                    marginTop: 12,
                    fontFamily: FONT,
                    fontSize: 15,
                    color: theme.greenText,
                    background: theme.greenTint,
                    display: "inline-block",
                    padding: "6px 12px",
                    borderRadius: 999,
                    fontWeight: 700,
                  }}
                >
                  Quiet · Near subway · Great value
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
