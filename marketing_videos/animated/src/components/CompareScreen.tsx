import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, FONT } from "../theme";
import { AppHeader } from "./StatusBar";

const AXES = ["Quiet", "Transit", "Value", "Clean", "Room"];
const HOTELS = [
  { name: "Ueno Riverside Inn", color: theme.accentSolid, values: [88, 75, 82, 90, 65] },
  { name: "Ginza Central", color: theme.amber, values: [55, 95, 60, 85, 80] },
];

function polygonPoints(values: number[], cx: number, cy: number, r: number) {
  return values
    .map((v, i) => {
      const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
      const dist = (v / 100) * r;
      return `${cx + Math.cos(angle) * dist},${cy + Math.sin(angle) * dist}`;
    })
    .join(" ");
}

export const CompareScreen: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - startFrame;

  const headingIn = spring({ frame: local - 4, fps, config: { damping: 18 } });
  const chartIn = spring({ frame: local - 30, fps, config: { damping: 16 } });
  const cx = 260;
  const cy = 230;
  const r = 150;

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
            marginBottom: 16,
          }}
        >
          Shortlist comparison
        </div>

        <svg width={520} height={460} viewBox="0 0 520 460" style={{ opacity: chartIn }}>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <polygon
              key={f}
              points={polygonPoints([100, 100, 100, 100, 100].map((v) => v * f), cx, cy, r)}
              fill="none"
              stroke={theme.line}
              strokeWidth={1.5}
            />
          ))}
          {AXES.map((axis, i) => {
            const angle = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
            const lx = cx + Math.cos(angle) * (r + 34);
            const ly = cy + Math.sin(angle) * (r + 34);
            return (
              <text
                key={axis}
                x={lx}
                y={ly}
                fontFamily={FONT}
                fontWeight={800}
                fontSize={17}
                fill={theme.muted}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {axis}
              </text>
            );
          })}
          {HOTELS.map((hotel, hi) => {
            const revealAt = 40 + hi * 26;
            const reveal = spring({ frame: local - revealAt, fps, config: { damping: 16 } });
            if (reveal <= 0.01) return null;
            const scaled = hotel.values.map((v) => v * reveal);
            return (
              <polygon
                key={hotel.name}
                points={polygonPoints(scaled, cx, cy, r)}
                fill={hotel.color}
                fillOpacity={0.25}
                stroke={hotel.color}
                strokeWidth={3}
              />
            );
          })}
        </svg>

        <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
          {HOTELS.map((hotel, i) => {
            const in2 = spring({ frame: local - 90 - i * 14, fps, config: { damping: 16 } });
            if (in2 <= 0.01) return null;
            return (
              <div
                key={hotel.name}
                style={{
                  opacity: in2,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: 16,
                  color: theme.ink,
                }}
              >
                <div style={{ width: 14, height: 14, borderRadius: 4, background: hotel.color }} />
                {hotel.name}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
