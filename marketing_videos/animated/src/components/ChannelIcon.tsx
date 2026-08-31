import React from "react";
import { AbsoluteFill } from "remotion";
import { theme, FONT } from "../theme";

// YouTube profile picture: uploaded square, displayed as a circle - keep
// the mark centered with generous padding so the circular crop never
// clips it.
export const ChannelIcon: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${theme.accentSolid} 0%, #4c1d95 100%)`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 340,
          color: "white",
        }}
      >
        S
      </div>
    </AbsoluteFill>
  );
};
