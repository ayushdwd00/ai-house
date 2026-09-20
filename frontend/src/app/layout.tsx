import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { ProjectProvider } from "@/context/ProjectContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["300", "400", "500", "600", "700"],
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
    <html lang="en" className={`${inter.variable} ${cormorant.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-[#0A0B0E] text-[#F5F3EF] font-sans selection:bg-[#C48446]/30 selection:text-[#F7DCB9]" suppressHydrationWarning>
        <ProjectProvider>
          {children}
        </ProjectProvider>
      </body>
    </html>
  );
}

