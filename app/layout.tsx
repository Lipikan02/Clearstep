import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clearstep — understand before you sign",
  description:
    "A calm, voice-guided way to review a crypto transaction before signing.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
