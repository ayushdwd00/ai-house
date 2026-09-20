"use client";

import React from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export type NavView = "home" | "plan" | "model" | "create";

interface FloatingNavProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  hasLayout?: boolean;
}

export const FloatingNav: React.FC<FloatingNavProps> = ({
  currentView,
  onNavigate,
  hasLayout = true,
}) => {
  const navItems: { id: NavView; label: string }[] = [
    { id: "home", label: "HOME" },
    { id: "plan", label: "PLAN" },
    { id: "model", label: "MODEL" },
  ];

  return (
    <header className="fixed top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <nav
        aria-label="Studio Navigation"
        className="pointer-events-auto flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#12141A]/85 backdrop-blur-md border border-white/10 shadow-2xl shadow-black/40 text-[11px] font-mono tracking-widest text-[#9E9C98]"
      >
        {/* Atelier Brand Emblem */}
        <button
          onClick={() => onNavigate("home")}
          className="flex items-center gap-2 pl-2 pr-3 py-1 text-[#F5F3EF] hover:text-[#C48446] transition-colors border-r border-white/10 group"
          title="Atelier Archai"
        >
          <div className="w-2 h-2 rounded-full bg-[#C48446] transition-transform group-hover:scale-125" />
          <span className="font-sans font-semibold tracking-wider text-xs">ATELIER</span>
        </button>

        {/* View Links */}
        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`relative px-4 py-1.5 rounded-full transition-all duration-200 ${
                  isActive
                    ? "text-[#F5F3EF] font-medium"
                    : "hover:text-[#F5F3EF] text-[#8E8B85]"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeNavIndicator"
                    className="absolute inset-0 rounded-full bg-white/10 border border-white/15"
                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* CREATE Primary Action Button */}
        <button
          onClick={() => onNavigate("create")}
          className={`ml-1.5 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-medium tracking-wider transition-all duration-300 ${
            currentView === "create"
              ? "bg-[#C48446] text-[#0A0B0E] shadow-lg shadow-[#C48446]/25"
              : "bg-[#F5F3EF] hover:bg-[#E8E4DC] text-[#0A0B0E] hover:shadow-md hover:shadow-white/10"
          }`}
        >
          <Sparkles className="w-3 h-3" />
          <span>CREATE</span>
        </button>
      </nav>
    </header>
  );
};
