"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  ArrowRight,
  Compass,
  Layers,
  Eye,
  CheckCircle2,
  ShieldCheck,
  Upload,
} from "lucide-react";
import dynamic from "next/dynamic";

const HeroHouse3D = dynamic(
  () => import("./HeroHouse3D").then((m) => m.HeroHouse3D),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-[#0C0E12] flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-[#C48446] animate-pulse" />
      </div>
    ),
  }
);

interface HomePageViewProps {
  onStartDesign: () => void;
  onOpenPlanMode: () => void;
  onOpenModelMode: () => void;
  onOpenUpload: () => void;
  onSelectPreset: (preset: {
    title: string;
    plot_width: number;
    plot_length: number;
    num_floors: number;
    bedrooms: number;
    bathrooms: number;
    style: string;
  }) => void;
}

export const HomePageView: React.FC<HomePageViewProps> = ({
  onStartDesign,
  onOpenPlanMode,
  onOpenModelMode,
  onOpenUpload,
  onSelectPreset,
}) => {
  return (
    <div className="w-full min-h-screen bg-[#0A0B0E] text-[#F5F3EF] overflow-x-hidden selection:bg-[#C48446]/30">
      {/* 1. CINEMATIC HERO SECTION */}
      <section className="relative w-full h-screen flex flex-col justify-between overflow-hidden">
        {/* Full-Screen 3D Modern House Canvas */}
        <div className="absolute inset-0 z-0">
          <HeroHouse3D
            className="w-full h-full"
            onClickHouse={onOpenModelMode}
          />
        </div>

        {/* Ambient Top Vignette & Subtle Atmospheric Gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0B0E]/80 via-transparent to-[#0A0B0E] pointer-events-none z-10" />

        {/* Top Spacer for floating nav */}
        <div className="w-full h-24 relative z-20" />

        {/* Main Hero Typography & Call-To-Action */}
        <div className="relative z-20 max-w-5xl mx-auto px-6 md:px-12 text-center flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono tracking-widest text-[#C48446] mb-6 uppercase"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#C48446] animate-pulse" />
            Computational Architectural Atelier
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-serif font-light tracking-tight text-[#F5F3EF] leading-[1.08] mb-6"
          >
            YOUR HOME. <br />
            <span className="italic font-normal text-[#FAF8F5]">DESIGNED INTELLIGENTLY.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-base sm:text-lg text-[#9E9C98] font-light max-w-xl mx-auto mb-10 leading-relaxed"
          >
            An avant-garde residential design platform synthesizing site physics,
            natural illumination, and bespoke room programs into cinematic 3D models and verified blueprints.
          </motion.p>

          {/* Primary Action Group */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto"
          >
            <button
              onClick={onStartDesign}
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-[#F5F3EF] text-[#0A0B0E] hover:bg-[#E8E4DC] font-medium text-xs tracking-widest uppercase transition-all duration-300 shadow-2xl shadow-white/10 hover:shadow-white/20 flex items-center justify-center gap-2 group"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>CREATE YOUR HOME</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </button>

            <button
              onClick={onOpenModelMode}
              className="w-full sm:w-auto px-8 py-4 rounded-full bg-[#12141A]/80 hover:bg-[#1A1D24] text-[#F5F3EF] border border-white/10 font-medium text-xs tracking-widest uppercase transition-all duration-300 flex items-center justify-center gap-2"
            >
              <span>EXPLORE 3D MODEL</span>
            </button>
          </motion.div>
        </div>

        {/* Bottom Scroll Indicator & Quick Upload Trigger */}
        <div className="relative z-20 w-full px-8 py-6 flex items-center justify-between text-[11px] font-mono text-[#6B6964]">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500/80" />
            <span>INTERACTIVE WEBGL MODEL ACTIVE</span>
          </div>

          <button
            onClick={onOpenUpload}
            className="flex items-center gap-2 text-[#9E9C98] hover:text-[#C48446] transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>HAVE A SKETCH OR PLAN? UPLOAD TO 3D</span>
          </button>
        </div>
      </section>

      {/* 2. STORY SECTION: FROM IDEA TO ARCHITECTURE */}
      <section className="relative w-full py-32 px-6 md:px-16 border-t border-white/5 bg-[#0A0B0E]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase block mb-3">
              PHILOSOPHY // 01
            </span>
            <h2 className="text-3xl sm:text-5xl font-serif font-light text-[#F5F3EF] leading-tight mb-6">
              From idea to architecture.
            </h2>
            <p className="text-base text-[#9E9C98] font-light leading-relaxed mb-6">
              Traditional home planning begins with static lines and abstract formulas.
              We reverse the paradigm: your family’s daily rituals, daylight path, and land boundaries
              generate a living architectural spatial model from the very first consultation question.
            </p>
            <div className="grid grid-cols-2 gap-6 pt-4 border-t border-white/10 text-xs font-mono text-[#9E9C98]">
              <div>
                <span className="text-2xl font-serif text-[#F5F3EF] block mb-1">Zero Overlaps</span>
                <span>CP-SAT mathematical spatial topology guarantees valid geometry.</span>
              </div>
              <div>
                <span className="text-2xl font-serif text-[#F5F3EF] block mb-1">Code Compliant</span>
                <span>Automated boundary setbacks and egress clearances embedded.</span>
              </div>
            </div>
          </div>

          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 bg-[#12141A]">
            <img
              src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1200&auto=format&fit=crop"
              alt="Architectural Craftsmanship"
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover grayscale contrast-125 hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0B0E] via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between text-xs font-mono text-[#F5F3EF]">
              <span>RESIDENTIAL STUDY // LOT 42</span>
              <span>SCANDINAVIAN MODERN</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. STORY SECTION: DESIGN EVERY DETAIL */}
      <section className="relative w-full py-32 px-6 md:px-16 border-t border-white/5 bg-[#0E1015]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-20">
            <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase block mb-3">
              PRECISION // 02
            </span>
            <h2 className="text-3xl sm:text-5xl font-serif font-light text-[#F5F3EF] mb-4">
              Design every detail.
            </h2>
            <p className="text-sm sm:text-base text-[#9E9C98] font-light">
              From window sill heights that catch the morning sun to en-suite privacy buffers and circulation spines.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-8 rounded-2xl bg-[#12141A]/90 border border-white/10 hover:border-[#C48446]/40 transition-colors">
              <Compass className="w-6 h-6 text-[#C48446] mb-6" />
              <h3 className="text-xl font-serif text-[#F5F3EF] mb-3">Solar Orientation</h3>
              <p className="text-sm text-[#9E9C98] font-light leading-relaxed">
                Rooms align with cardinal solar trajectories, keeping social spaces flooded with morning daylight and sleeping quarters sheltered.
              </p>
            </div>

            <div className="p-8 rounded-2xl bg-[#12141A]/90 border border-white/10 hover:border-[#C48446]/40 transition-colors">
              <Layers className="w-6 h-6 text-[#C48446] mb-6" />
              <h3 className="text-xl font-serif text-[#F5F3EF] mb-3">Acoustic Zoning</h3>
              <p className="text-sm text-[#9E9C98] font-light leading-relaxed">
                Bedrooms are buffered by dressing vestibules and en-suite bathrooms, isolating resting spaces from active living and culinary zones.
              </p>
            </div>

            <div className="p-8 rounded-2xl bg-[#12141A]/90 border border-white/10 hover:border-[#C48446]/40 transition-colors">
              <ShieldCheck className="w-6 h-6 text-[#C48446] mb-6" />
              <h3 className="text-xl font-serif text-[#F5F3EF] mb-3">Structural Integrity</h3>
              <p className="text-sm text-[#9E9C98] font-light leading-relaxed">
                Vertical staircase cores and plumbing stacks align across multi-story levels to streamline engineering and construction execution.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. STORY SECTION: AI-POWERED ARCHITECTURAL PLANNING */}
      <section className="relative w-full py-32 px-6 md:px-16 border-t border-white/5 bg-[#0A0B0E]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 bg-[#12141A] order-2 lg:order-1">
            <img
              src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=1200&auto=format&fit=crop"
              alt="Floor plan geometry"
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover contrast-110"
            />
            <div className="absolute inset-0 bg-[#0A0B0E]/30" />
            <div className="absolute top-6 left-6 px-3 py-1.5 rounded-full bg-[#0A0B0E]/80 border border-white/10 text-[10px] font-mono text-[#C48446]">
              TOPOLOGY SOLVER // SHAPELY + NETWORKX
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase block mb-3">
              INTELLIGENCE // 03
            </span>
            <h2 className="text-3xl sm:text-5xl font-serif font-light text-[#F5F3EF] leading-tight mb-6">
              AI-powered architectural planning.
            </h2>
            <p className="text-base text-[#9E9C98] font-light leading-relaxed mb-6">
              Unlike generic generative models that fabricate hallucinatory images, our architectural engine solves real constraint systems:
              graph adjacency, minimum clearance corridors, setback buffers, and door swing physics.
            </p>
            <ul className="space-y-3 text-sm text-[#9E9C98] font-light">
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#C48446]" />
                <span>Deterministic constraint-satisfaction (Google OR-Tools CP-SAT)</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#C48446]" />
                <span>Real-time mathematical room scoring and circulation analysis</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#C48446]" />
                <span>Export-ready 2D blueprint vectors and Three.js 3D meshes</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 5. STORY SECTION: EXPLORE YOUR HOME IN 3D */}
      <section className="relative w-full py-32 px-6 md:px-16 border-t border-white/5 bg-[#0E1015]">
        <div className="max-w-6xl mx-auto flex flex-col items-center text-center">
          <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase block mb-3">
            IMMERSION // 04
          </span>
          <h2 className="text-3xl sm:text-5xl font-serif font-light text-[#F5F3EF] mb-4">
            Explore your home in 3D.
          </h2>
          <p className="text-base text-[#9E9C98] font-light max-w-xl mb-12">
            Orbit your residence as an architectural dollhouse, inspect cutaway elevations floor by floor,
            and study daylight through real architectural shadow maps.
          </p>

          <div className="w-full h-96 rounded-2xl border border-white/10 overflow-hidden relative group bg-[#12141A]">
            <img
              src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=1600&auto=format&fit=crop"
              alt="3D Architectural Dollhouse View"
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <button
                onClick={onOpenModelMode}
                className="px-8 py-3.5 rounded-full bg-[#F5F3EF] text-[#0A0B0E] font-medium text-xs tracking-widest uppercase hover:bg-white transition-all shadow-2xl flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                <span>LAUNCH 3D VIEWER</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 6. STORY SECTION: CURATED ARCHITECTURAL TYPOLOGIES */}
      <section className="relative w-full py-32 px-6 md:px-16 border-t border-white/5 bg-[#0A0B0E]">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-16 gap-4">
            <div>
              <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase block mb-3">
                TYPOLOGIES // 05
              </span>
              <h2 className="text-3xl sm:text-5xl font-serif font-light text-[#F5F3EF]">
                Curated architectural designs.
              </h2>
            </div>
            <button
              onClick={onStartDesign}
              className="text-xs font-mono tracking-widest text-[#C48446] hover:text-[#F5F3EF] transition-colors flex items-center gap-2 group"
            >
              <span>CREATE BESPOKE HOME</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: "Nordic Courtyard Residence",
                size: "40' × 60'",
                area: "2,400 SQ FT",
                img: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=800&auto=format&fit=crop",
                intake: {
                  title: "Nordic Courtyard Residence",
                  plot_width: 40,
                  plot_length: 60,
                  num_floors: 2,
                  bedrooms: 3,
                  bathrooms: 2,
                  style: "Modern Scandinavian",
                },
              },
              {
                title: "Contemporary Glass Pavilion",
                size: "48' × 54'",
                area: "1,950 SQ FT",
                img: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=800&auto=format&fit=crop",
                intake: {
                  title: "Contemporary Glass Pavilion",
                  plot_width: 48,
                  plot_length: 54,
                  num_floors: 1,
                  bedrooms: 3,
                  bathrooms: 2,
                  style: "Modern Contemporary",
                },
              },
              {
                title: "The Cedar Cantilever Villa",
                size: "45' × 65'",
                area: "3,100 SQ FT",
                img: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=800&auto=format&fit=crop",
                intake: {
                  title: "The Cedar Cantilever Villa",
                  plot_width: 45,
                  plot_length: 65,
                  num_floors: 2,
                  bedrooms: 4,
                  bathrooms: 3,
                  style: "Minimalist Modern",
                },
              },
            ].map((p, idx) => (
              <div
                key={idx}
                onClick={() => onSelectPreset(p.intake)}
                className="group cursor-pointer flex flex-col"
              >
                <div className="relative aspect-[4/3] rounded-2xl overflow-hidden mb-4 border border-white/10 bg-[#12141A]">
                  <img
                    src={p.img}
                    alt={p.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                    <span className="text-xs font-mono tracking-widest text-[#F5F3EF]">
                      LOAD ARCHITECTURAL MODEL →
                    </span>
                  </div>
                </div>
                <h3 className="text-lg font-serif text-[#F5F3EF] mb-1 group-hover:text-[#C48446] transition-colors">
                  {p.title}
                </h3>
                <span className="text-xs font-mono text-[#9E9C98]">
                  {p.size} · {p.area}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. FINAL CALL-TO-ACTION */}
      <section className="relative w-full py-36 px-6 md:px-16 border-t border-white/5 bg-gradient-to-b from-[#0A0B0E] to-[#12141A] text-center">
        <div className="max-w-3xl mx-auto flex flex-col items-center">
          <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase block mb-4">
            BEGIN CONSULTATION
          </span>
          <h2 className="text-4xl sm:text-6xl font-serif font-light text-[#F5F3EF] mb-6">
            Ready to design your residence?
          </h2>
          <p className="text-base text-[#9E9C98] font-light max-w-lg mb-10">
            Start the step-by-step architectural consultation and experience your future home generated in minutes.
          </p>

          <button
            onClick={onStartDesign}
            className="px-10 py-4 rounded-full bg-[#C48446] text-[#0A0B0E] hover:bg-[#D49354] font-medium text-xs tracking-widest uppercase transition-all duration-300 shadow-2xl shadow-[#C48446]/25 flex items-center gap-2 group"
          >
            <Sparkles className="w-4 h-4" />
            <span>CREATE YOUR HOME</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </section>
    </div>
  );
};
