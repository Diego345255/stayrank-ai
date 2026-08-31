import React from "react";
import { theme } from "../theme";

export const PhoneFrame: React.FC<{ children: React.ReactNode; scale?: number }> = ({
  children,
  scale = 1,
}) => {
  return (
    <div
      style={{
        width: 620,
        height: 1180,
        borderRadius: 56,
        background: "#0d0a10",
        padding: 16,
        boxShadow: "0 40px 90px rgba(0,0,0,0.45)",
        transform: `scale(${scale})`,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 42,
          background: theme.cream,
          overflow: "hidden",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </div>
  );
};
