import type { Metadata } from "next";
import { Inter, Instrument_Serif, IBM_Plex_Mono } from "next/font/google";
import "@designcodeio/threeui/style.css";
import "./globals.css";
import { ProjectProvider } from "@/context/ProjectContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ATELIER ARCHAI — Intelligent Architectural Studio",
  description: "Bespoke residential architecture designed with computational intelligence. Experience your home in cinematic 3D and high-precision blueprints.",
  keywords: ["architecture studio", "residential design", "bespoke architecture", "3D architectural visualization", "architectural floor plans"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable} ${plexMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-[#030303] text-[#F5F5F5] font-sans selection:bg-[#8B5CF6]/30 selection:text-white" suppressHydrationWarning>
        <ProjectProvider>
          {children}
        </ProjectProvider>
      </body>
    </html>
  );
}

