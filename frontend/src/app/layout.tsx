import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Airdrop Alpha & Due Diligence Engine",
  description:
    "Auditoria fundamentalista Web3, plano estratégico Anti-Sybil e monitoramento automatizado de roadmaps.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body
        className={`${inter.variable} ${jetbrains.variable} font-sans bg-canvas text-slate-100 antialiased selection:bg-emerald-500/30 selection:text-emerald-200`}
      >
        {children}
      </body>
    </html>
  );
}
