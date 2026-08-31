import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const PERSONAS = ["Couple", "Family", "Business", "First-time"];

export const PersonaScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });
  const activeIndex = local < 90 ? 2 : 2;
  const wifiW = interpolate(local, [60, 90], [50, 78], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const transitW = interpolate(local, [60, 90], [45, 62], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

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
          Trip type
        </div>

        <div style={{ opacity: headingIn, display: "flex", gap: 8, marginBottom: 26, flexWrap: "wrap" }}>
          {PERSONAS.map((p, i) => (
            <div
              key={p}
              style={{
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 13,
                color: i === activeIndex ? "#fff" : theme.muted,
                background: i === activeIndex ? theme.accentSolid : theme.soft,
                borderRadius: 999,
                padding: "8px 14px",
              }}
            >
              {p}
            </div>
          ))}
        </div>

        <div style={{ fontFamily: FONT, fontSize: 13, color: theme.muted, marginBottom: 14 }}>
          Ranking weights shift automatically:
        </div>

        {[{ label: "Wifi", w: wifiW }, { label: "Transit", w: transitW }].map((row) => (
          <div key={row.label} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT, fontSize: 13, color: theme.ink, marginBottom: 4 }}>
              <span>{row.label}</span>
              <span style={{ fontWeight: 700 }}>{Math.round(row.w)}</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: theme.soft, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${row.w}%`, background: theme.accentSolid, borderRadius: 4 }} />
            </div>
          </div>
        ))}

        {local > 130 && (
          <div
            style={{
              marginTop: 20,
              opacity: interpolate(local, [130, 150], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 16,
              color: theme.muted,
              lineHeight: 1.4,
            }}
          >
            Business trip? Wifi and transit weigh more - shown, not hidden.
          </div>
        )}
      </div>
    </div>
  );
};
