import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT } from "../theme";

const LIGHT = { paper: "#ffffff", ink: "#2a182e", muted: "#7a6b7d", accent: "#6d28d9", soft: "#f3f1ee" };
const DARK = { paper: "#1c1622", ink: "#f1eaf7", muted: "#a99bb5", accent: "#b79bff", soft: "#241c2c" };

export const DarkModeScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const switchAt = 165;
  const switchProgress = interpolate(local, [switchAt, switchAt + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const mix = (a: string, b: string, t: number) => {
    const pa = a.match(/\w\w/g)!.map((h) => parseInt(h, 16));
    const pb = b.match(/\w\w/g)!.map((h) => parseInt(h, 16));
    const r = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
    return `#${r.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  };

  const paper = mix(LIGHT.paper, DARK.paper, switchProgress);
  const ink = mix(LIGHT.ink, DARK.ink, switchProgress);
  const muted = mix(LIGHT.muted, DARK.muted, switchProgress);
  const accent = mix(LIGHT.accent, DARK.accent, switchProgress);
  const soft = mix(LIGHT.soft, DARK.soft, switchProgress);

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: soft }}>
      <div
        style={{
          padding: "22px 28px",
          borderBottom: `2px solid ${muted}22`,
          background: paper,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: 800,
              fontSize: 18,
              fontFamily: FONT,
            }}
          >
            S
          </div>
          <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 24, color: ink }}>
            StayRank AI
          </span>
        </div>
        <div
          style={{
            width: 52,
            height: 30,
            borderRadius: 999,
            background: accent,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 3,
              left: 3 + switchProgress * 22,
              width: 24,
              height: 24,
              borderRadius: 999,
              background: "white",
            }}
          />
        </div>
      </div>

      <div style={{ padding: "30px 28px", flex: 1 }}>
        <div style={{ opacity: headingIn, fontFamily: FONT, fontWeight: 800, fontSize: 26, color: ink, marginBottom: 20 }}>
          Every color, measured
        </div>

        <div
          style={{
            background: paper,
            borderRadius: 20,
            padding: 22,
            border: `1px solid ${muted}33`,
          }}
        >
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 21, color: ink }}>
            Ueno Riverside Inn
          </div>
          <div style={{ fontFamily: FONT, fontSize: 17, color: muted, marginTop: 8 }}>
            $174/night · 4.6 guest rating
          </div>
          <div
            style={{
              marginTop: 14,
              display: "inline-block",
              background: accent,
              color: "white",
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 15,
              padding: "7px 14px",
              borderRadius: 999,
            }}
          >
            🏆 Top Match
          </div>
        </div>

        {local > switchAt + 30 && (
          <div
            style={{
              marginTop: 26,
              opacity: interpolate(local, [switchAt + 30, switchAt + 50], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 18,
              color: ink,
              lineHeight: 1.45,
            }}
          >
            Full dark mode, WCAG-checked — every badge and button contrast-tested, not just
            inverted colors.
          </div>
        )}
      </div>
    </div>
  );
};
