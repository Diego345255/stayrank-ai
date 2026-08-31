import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const QUESTION = "Is breakfast included, and is there a pool?";
const ANSWER =
  "Breakfast is available for an extra fee (not included in the room rate). No pool is listed for this property.";

export const AskHotelScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });
  const qIn = spring({ frame: local - 26, fps, config: { damping: 16 } });

  const answerCharsToShow = Math.max(0, Math.min(ANSWER.length, Math.floor((local - 90) * 2.2)));
  const answerTyped = ANSWER.slice(0, answerCharsToShow);

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
            marginBottom: 6,
          }}
        >
          💬 Ask this hotel
        </div>
        <div
          style={{
            opacity: headingIn,
            fontFamily: FONT,
            fontSize: 16,
            color: theme.muted,
            marginBottom: 22,
          }}
        >
          Grounded only in this hotel's own real data
        </div>

        {qIn > 0.01 && (
          <div
            style={{
              opacity: qIn,
              transform: `translateX(${interpolate(qIn, [0, 1], [30, 0])}px)`,
              alignSelf: "flex-end",
              marginLeft: "auto",
              maxWidth: 420,
              background: theme.accentSolid,
              color: "white",
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 19,
              padding: "14px 18px",
              borderRadius: "18px 18px 4px 18px",
              marginBottom: 20,
            }}
          >
            {QUESTION}
          </div>
        )}

        {local > 84 && (
          <div
            style={{
              opacity: interpolate(local, [84, 96], [0, 1], { extrapolateRight: "clamp" }),
              maxWidth: 440,
              background: theme.paper,
              border: `1px solid ${theme.line}`,
              fontFamily: FONT,
              fontSize: 18,
              color: theme.ink,
              padding: "14px 18px",
              borderRadius: "18px 18px 18px 4px",
              lineHeight: 1.45,
              minHeight: 90,
            }}
          >
            {answerTyped}
            <span style={{ opacity: local % 20 < 10 ? 1 : 0 }}>▌</span>
          </div>
        )}

        {local > 170 && (
          <div
            style={{
              marginTop: 24,
              opacity: interpolate(local, [170, 190], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 16,
              color: theme.muted,
              lineHeight: 1.4,
            }}
          >
            Never guesses — if the data isn't there, it says so instead of making something up.
          </div>
        )}
      </div>
    </div>
  );
};
