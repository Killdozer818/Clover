import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "../styles.css";

export const metadata: Metadata = {
  title: "Clover",
  description: "A private reading shelf for books, streaks, ratings, and reading stats.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg"
  },
  appleWebApp: {
    capable: true,
    title: "Clover",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  themeColor: "#07120d",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
