import React from "react";
import { theme, FONT } from "../theme";

export const AppHeader: React.FC = () => (
  <div
    style={{
      padding: "22px 28px 16px",
      borderBottom: `2px solid ${theme.line}`,
      background: theme.paper,
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
          background: theme.accentSolid,
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
      <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 24, color: theme.ink }}>
        StayRank AI
      </span>
    </div>
  </div>
);
