import type { Metadata, Viewport } from "next";
import RuneDuel from "@/components/RuneDuel";

const title = "Rune Duel — draw glyphs, cast spells";
const description =
  "A 75-second spell duel atop a moonlit tower. Draw glyphs to hurl lightning, fire, frost and shields at mischievous spirits — can you beat 7,500?";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    siteName: "Rune Duel",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#05051a",
};

export default function Home() {
  return <RuneDuel />;
}
