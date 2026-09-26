"use client";

import React from "react";
import { motion } from "framer-motion";
import { Sparkles, ImageIcon } from "lucide-react";

// ============================================================
// NavView type — includes "image" for Gemini visualization
// ============================================================
export type NavView =
  | "home"
  | "plan"
  | "model"
  | "image"
  | "structure"
  | "estimate"
  | "create"
  | "projects"
  | "edit";

interface FloatingNavProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  isProjectWorkspace?: boolean;
  hasProject?: boolean;
  onOpenProjects?: () => void;
  onOpenVastuAudit?: () => void;
  hasVastuResult?: boolean;
}

// ============================================================
// COMPONENT
// ============================================================
export const FloatingNav: React.FC<FloatingNavProps> = ({
  currentView,
  onNavigate,
  isProjectWorkspace = false,
  hasProject = false,
  onOpenProjects,
  onOpenVastuAudit,
  hasVastuResult = false,
}) => {
  // Inside a project workspace: HOME | PLAN | MODEL | IMAGE | STRUCTURE | ESTIMATE
  // On home / landing: HOME | PROJECTS
  const projectNavItems: { id: NavView; label: string; icon?: React.ReactNode }[] = [
    { id: "home", label: "HOME" },
    { id: "plan", label: "PLAN" },
    { id: "model", label: "MODEL" },
    {
      id: "image",
      label: "IMAGE",
      icon: <ImageIcon className="w-2.5 h-2.5" />,
    },
    { id: "structure", label: "STRUCTURE" },
    { id: "estimate", label: "ESTIMATE" },
  ];

  const homeNavItems: { id: NavView; label: string }[] = [
    { id: "home", label: "HOME" },
    { id: "projects", label: "PROJECTS" },
  ];

  const navItems = isProjectWorkspace ? projectNavItems : homeNavItems;

  const handleNavClick = (id: NavView) => {
    if (id === "projects" && onOpenProjects) {
      onOpenProjects();
    } else {
      onNavigate(id);
    }
  };

  return (
    <header className="fixed top-4 sm:top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none max-w-[calc(100vw-12px)]">
      <nav
        aria-label="Studio Navigation"
        className="pointer-events-auto flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-1.5 rounded-full bg-[#0F1117]/92 backdrop-blur-md border border-white/10 shadow-2xl shadow-black/40 text-[10px] sm:text-[11px] font-mono tracking-wider sm:tracking-widest text-[#9E9C98]"
      >
        {/* ── Brand emblem ── */}
        <button
          onClick={() => onNavigate("home")}
          className="flex items-center gap-1.5 pl-2 pr-2.5 py-1 text-[#F5F3EF] hover:text-[#C48446] transition-colors border-r border-white/8 group shrink-0"
          title="Atelier Archai"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-[#C48446] transition-transform group-hover:scale-125" />
          <span className="font-sans font-semibold tracking-wider text-[10px] sm:text-[11px] hidden sm:inline">
            ATELIER
          </span>
        </button>

        {/* ── Nav items ── */}
        <div className="flex items-center gap-0.5">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            const isImage = item.id === "image";
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`relative flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full transition-all duration-200 ${
                  isActive
                    ? "text-[#F5F3EF] font-medium"
                    : "hover:text-[#F5F3EF] text-[#8E8B85]"
                } ${isImage ? "hidden sm:flex" : ""}`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeNavIndicator"
                    className={`absolute inset-0 rounded-full ${
                      isImage
                        ? "bg-[#C48446]/15 border border-[#C48446]/25"
                        : "bg-white/10 border border-white/15"
                    }`}
                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                  />
                )}
                {item.icon && (
                  <span className="relative z-10">{item.icon}</span>
                )}
                <span className="relative z-10">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Vastu pill (project workspace only) ── */}
        {isProjectWorkspace && hasVastuResult && onOpenVastuAudit && (
          <button
            onClick={onOpenVastuAudit}
            className="hidden lg:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#C48446]/15 hover:bg-[#C48446]/25 border border-[#C48446]/30 text-[#C48446] text-[10px] font-mono transition-colors shrink-0"
            title="View Vastu Compliance Audit"
          >
            VASTU
          </button>
        )}

        {/* ── Create CTA ── */}
        <button
          onClick={() => onNavigate("create")}
          className={`ml-0.5 sm:ml-1 flex items-center gap-1 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-[11px] font-medium tracking-wider transition-all duration-300 shrink-0 ${
            currentView === "create"
              ? "bg-[#C48446] text-[#0A0B0E] shadow-lg shadow-[#C48446]/25"
              : "bg-[#F5F3EF] hover:bg-[#E8E4DC] text-[#0A0B0E] hover:shadow-md"
          }`}
        >
          <Sparkles className="w-2.5 h-2.5" />
          <span className="hidden sm:inline">CREATE</span>
        </button>
      </nav>
    </header>
  );
};
