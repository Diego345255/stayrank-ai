import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

export const VerifiedStarScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });
  const cardIn = spring({ frame: local - 24, fps, config: { damping: 15 } });
  const claimedStars = 5;
  const verifiedStars = 4;

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
            marginBottom: 20,
          }}
        >
          Ginza Central
        </div>

        <div
          style={{
            opacity: cardIn,
            transform: `translateY(${interpolate(cardIn, [0, 1], [26, 0])}px)`,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16 }}>
            <div style={{ fontFamily: FONT, fontSize: 12, color: theme.muted, marginBottom: 6 }}>
              Self-reported by property
            </div>
            <div style={{ fontFamily: FONT, fontSize: 20, color: theme.muted, textDecoration: local > 70 ? "line-through" : "none" }}>
              {"★".repeat(claimedStars)}
            </div>
          </div>

          {local > 60 && (
            <div
              style={{
                opacity: interpolate(local, [60, 85], [0, 1], { extrapolateRight: "clamp" }),
                background: theme.greenTint,
                border: `1.5px solid ${theme.greenText}`,
                borderRadius: 14,
                padding: 16,
              }}
            >
              <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: theme.greenText, marginBottom: 6 }}>
                ✓ Verified by Booking.com
              </div>
              <div style={{ fontFamily: FONT, fontSize: 20, color: theme.greenText }}>
                {"★".repeat(verifiedStars)}
              </div>
            </div>
          )}
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
            When a real, independently verified rating exists, StayRank AI shows that one - not the inflated self-reported number.
          </div>
        )}
      </div>
    </div>
  );
};
