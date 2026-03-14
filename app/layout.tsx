import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Big Dawg TYPE SHIT",
  description: "Double elimination bracket system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
