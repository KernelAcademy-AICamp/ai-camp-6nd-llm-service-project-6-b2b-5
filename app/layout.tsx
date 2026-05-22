import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "B2B 5팀",
  description: "AI Camp 6기 LLM Service Project - B2B 5팀",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
