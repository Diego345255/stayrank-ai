import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const TAGS = [
  { label: "🧹 Cleanliness", n: 4, tone: "good" as const },
  { label: "📍 Location", n: 5, tone: "good" as const },
  { label: "🙋 Staff & service", n: 3, tone: "good" as const },
  { label: "⚠️ Possible red flags", n: 2, tone: "warn" as const },
];

export const ReviewThemesScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
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
            lineHeight: 1.3,
            marginBottom: 20,
          }}
        >
          What guests actually mention
          <div style={{ fontWeight: 600, fontSize: 17, color: theme.muted, marginTop: 6 }}>
            from 14 real reviews — a real keyword count, never an AI-smoothed summary
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {TAGS.map((tag, i) => {
            const inAnim = spring({
              frame: local - 22 - i * 14,
              fps,
              config: { damping: 14 },
            });
            if (inAnim <= 0.01) return null;
            const bg = tag.tone === "warn" ? theme.amberTint : theme.greenTint;
            const fg = tag.tone === "warn" ? theme.amber : theme.greenText;
            return (
              <div
                key={tag.label}
                style={{
                  opacity: inAnim,
                  transform: `scale(${interpolate(inAnim, [0, 1], [0.7, 1])})`,
                  background: bg,
                  color: fg,
                  fontFamily: FONT,
                  fontWeight: 800,
                  fontSize: 19,
                  padding: "12px 18px",
                  borderRadius: 999,
                }}
              >
                {tag.label} · {tag.n}
              </div>
            );
          })}
        </div>

        {local > 96 && (
          <div
            style={{
              marginTop: 40,
              opacity: interpolate(local, [96, 116], [0, 1], { extrapolateRight: "clamp" }),
              fontFamily: FONT,
              fontSize: 19,
              color: theme.ink,
              background: theme.paper,
              border: `2px solid ${theme.accentTint}`,
              borderRadius: 18,
              padding: 20,
              lineHeight: 1.45,
            }}
          >
            No AI review smoothing.{" "}
            <span style={{ color: theme.muted }}>
              A real complaint stays visible — never softened into a summary.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
