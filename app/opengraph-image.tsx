import { ImageResponse } from "next/og";

export const alt = "Rune Duel — draw glyphs, cast spells";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const glyphs = [
  { color: "#ffd84a", label: "Lightning", d: "M10 62 L33 18 L57 62 L80 18" },
  { color: "#78ffaa", label: "Shield", d: "M45 10 A30 30 0 1 1 44.9 10" },
  { color: "#ff7038", label: "Fire", d: "M45 10 L80 68 L10 68 Z" },
  { color: "#78d6ff", label: "Frost", d: "M10 40 L80 40" },
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #05051a 0%, #141338 50%, #3a2c6b 100%)",
          color: "#ffe6a3",
          fontFamily: "serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 60,
            right: 110,
            width: 150,
            height: 150,
            borderRadius: 150,
            background: "#f2f0e6",
            boxShadow: "0 0 120px 40px rgba(190,195,255,0.35)",
          }}
        />
        <div style={{ fontSize: 150, fontWeight: 700, letterSpacing: -2 }}>Rune Duel</div>
        <div style={{ fontSize: 40, color: "#dcd6ff", marginTop: 4 }}>Draw glyphs. Cast spells. Beat 7,500.</div>
        <div style={{ display: "flex", marginTop: 54 }}>
          {glyphs.map((g) => (
            <div key={g.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "0 34px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 130,
                  height: 130,
                  borderRadius: 130,
                  background: "#1a1438",
                  border: `4px solid ${g.color}`,
                  boxShadow: `0 0 50px ${g.color}88`,
                }}
              >
                <svg width="90" height="80" viewBox="0 0 90 80">
                  <path d={g.d} fill="none" stroke={g.color} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ fontSize: 28, color: g.color, marginTop: 14 }}>{g.label}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
