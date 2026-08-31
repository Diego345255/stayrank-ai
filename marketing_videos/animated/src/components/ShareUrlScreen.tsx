import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

export const ShareUrlScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });
  const cardIn = spring({ frame: local - 24, fps, config: { damping: 15 } });
  const copied = local > 90;
  const copiedIn = spring({ frame: local - 90, fps, config: { damping: 16 } });

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
          Share this search
        </div>

        <div
          style={{
            opacity: cardIn,
            transform: `translateY(${interpolate(cardIn, [0, 1], [26, 0])}px)`,
            background: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: 14,
            padding: 16,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              flex: 1,
              fontFamily: "monospace",
              fontSize: 12,
              color: theme.muted,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            clearstay.online/?city=Tokyo&budget=180&nights=3
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 13,
              color: "#fff",
              background: copied ? theme.greenText : theme.accentSolid,
              borderRadius: 10,
              padding: "8px 14px",
              opacity: copied ? copiedIn : 1,
            }}
          >
            {copied ? "Copied ✓" : "Copy link"}
          </div>
        </div>

        {local > 130 && (
          <div
            style={{
              marginTop: 26,
              opacity: interpolate(local, [130, 150], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 17,
              color: theme.muted,
              lineHeight: 1.4,
            }}
          >
            Your whole search - filters, dates, budget - in one real link.
          </div>
        )}
      </div>
    </div>
  );
};
