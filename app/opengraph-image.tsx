import { ImageResponse } from "next/og";

import { site } from "@/lib/site";

export const alt = `${site.name} — ${site.shortDescription}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background:
          "radial-gradient(1200px 600px at 10% -10%, rgba(99,102,241,0.35), transparent), radial-gradient(900px 500px at 100% 0%, rgba(139,92,246,0.28), transparent), #0a0a0a",
        padding: "72px 80px",
        color: "#fafafa",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            fontSize: 30,
          }}
        >
          📡
        </div>
        <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: -0.5 }}>
          {site.name}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div
          style={{
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -2,
            maxWidth: 900,
          }}
        >
          Find what founders are complaining about.
        </div>
        <div
          style={{
            fontSize: 30,
            color: "#a1a1aa",
            maxWidth: 860,
            lineHeight: 1.3,
          }}
        >
          Scored pain-point reports mined from Reddit communities.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          fontSize: 24,
          color: "#a1a1aa",
        }}
      >
        <span>Urgency</span>
        <span style={{ color: "#3f3f46" }}>·</span>
        <span>Willingness to pay</span>
        <span style={{ color: "#3f3f46" }}>·</span>
        <span>Verbatim evidence</span>
        <span style={{ color: "#3f3f46" }}>·</span>
        <span>Markdown export</span>
      </div>
    </div>,
    { ...size },
  );
}
