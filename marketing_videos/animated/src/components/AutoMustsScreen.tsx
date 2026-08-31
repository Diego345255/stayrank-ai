import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

export const AutoMustsScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });
  const promptIn = spring({ frame: local - 20, fps, config: { damping: 15 } });
  const noteIn = spring({ frame: local - 60, fps, config: { damping: 15 } });

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
            marginBottom: 18,
          }}
        >
          "walking distance to subway"
        </div>

        <div
          style={{
            opacity: promptIn,
            transform: `translateY(${interpolate(promptIn, [0, 1], [20, 0])}px)`,
            background: theme.soft,
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            padding: 14,
            fontFamily: FONT,
            fontSize: 13,
            color: theme.muted,
            marginBottom: 18,
          }}
        >
          Your description turned this into a hard requirement, not just a preference.
        </div>

        {local > 55 && (
          <div
            style={{
              opacity: noteIn,
              transform: `translateY(${interpolate(noteIn, [0, 1], [20, 0])}px)`,
              background: theme.amberTint,
              border: `1.5px solid ${theme.amber}`,
              borderRadius: 14,
              padding: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: theme.amber }}>
                ☑ Near transit
              </div>
              <div style={{ fontFamily: FONT, fontSize: 11, color: theme.amber, marginTop: 2, opacity: 0.85 }}>
                auto-applied
              </div>
            </div>
            <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: theme.amber }}>
              uncheck to loosen
            </div>
          </div>
        )}

        {local > 130 && (
          <div
            style={{
              marginTop: 24,
              opacity: interpolate(local, [130, 150], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 16,
              color: theme.muted,
              lineHeight: 1.4,
            }}
          >
            Never a silent filter - shown, and always undoable.
          </div>
        )}
      </div>
    </div>
  );
};
