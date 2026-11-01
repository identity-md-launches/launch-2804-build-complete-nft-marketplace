import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
export const metadata: Metadata = {
  title: "Squeek Market · On-chain companions",
  description:
    "Explore and trade Squeekchain’s Squeeks on Sepolia. See the live power, rewards, level, and cooldown that travel with every NFT.",
  icons: { icon: "./favicon.svg" },
  openGraph: {
    title: "Squeek Market · Meet your next Squeek",
    description: "On-chain companions. Their power and rewards come with them.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Squeek Market",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta property="og:image" content="./og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:image" content="./og-image.png" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
