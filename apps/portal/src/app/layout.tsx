import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "TalloCPA Portal",
  description: "Upload your source documents to TalloCPA.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <header className="masthead">
          <a href="/" className="brand">
            Tallo<span>CPA</span>
          </a>
          <span className="masthead-sub">Client portal</span>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
