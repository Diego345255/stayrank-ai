import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

export const BillingScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });
  const cardIn = spring({ frame: local - 24, fps, config: { damping: 15 } });

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
          Trip Planner Pro
        </div>

        <div
          style={{
            opacity: cardIn,
            transform: `translateY(${interpolate(cardIn, [0, 1], [26, 0])}px)`,
            background: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: 16,
            padding: 20,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 30, marginBottom: 10 }}>🔒</div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: theme.ink, marginBottom: 6 }}>
            Secure Stripe Checkout
          </div>
          <div style={{ fontFamily: FONT, fontSize: 13, color: theme.muted, lineHeight: 1.4 }}>
            Card details go straight to Stripe's hosted page
          </div>
        </div>

        {local > 90 && (
          <div
            style={{
              marginTop: 20,
              opacity: interpolate(local, [90, 110], [0, 1], { extrapolateRight: "clamp" }),
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 14,
              color: theme.greenText,
            }}
          >
            ✓ StayRank AI never sees your card number
          </div>
        )}

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
            Real Stripe billing, cancel anytime from your own portal.
          </div>
        )}
      </div>
    </div>
  );
};
