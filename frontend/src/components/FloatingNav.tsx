"use client";

import React from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export type NavView =
  | "home"
  | "plan"
  | "model"
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
  isPlanEditMode?: boolean;
  onTogglePlanEditMode?: () => void;
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
  isPlanEditMode = false,
  onTogglePlanEditMode,
}) => {
  // Inside a project workspace: HOME | PLAN | EDIT MODE | MODEL | STRUCTURE | ESTIMATE
  // On home / landing: HOME | PROJECTS
  const projectNavItems: { id: NavView; label: string }[] = [
    { id: "home", label: "HOME" },
    { id: "plan", label: "PLAN" },
    { id: "model", label: "MODEL" },
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

  const renderEditModeToggle = () => (
    <button
      type="button"
      onClick={onTogglePlanEditMode}
      aria-label={isPlanEditMode ? "Exit Edit Mode" : "Enter Edit Mode"}
      aria-pressed={isPlanEditMode}
      title={isPlanEditMode ? "Exit Edit Mode" : "Enter Edit Mode"}
      className={`flex shrink-0 items-center justify-center whitespace-nowrap px-1 max-[360px]:px-0.5 sm:px-2.5 py-1 sm:py-1.5 rounded-full transition-colors text-[9px] max-[360px]:text-[8px] sm:text-[11px] tracking-normal sm:tracking-wider ${
        isPlanEditMode
          ? "bg-[#C48446]/15 text-[#C48446] border border-[#C48446]/25"
          : "bg-white/5 hover:bg-white/10 text-[#9E9C98] hover:text-[#F5F3EF]"
      }`}
    >
      <span>EDIT MODE</span>
    </button>
  );

  return (
    <>
      <header className="fixed top-4 sm:top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none max-w-[calc(100vw-12px)]">
        <nav
          aria-label="Studio Navigation"
          className="pointer-events-auto flex w-max max-w-full flex-nowrap items-center gap-0 sm:gap-1 px-1 max-[360px]:px-0.5 sm:px-2 py-1 sm:py-1.5 rounded-full bg-[#0F1117]/92 backdrop-blur-md border border-white/10 shadow-2xl shadow-black/40 text-[9px] max-[360px]:text-[8px] sm:text-[11px] font-mono tracking-normal sm:tracking-widest text-[#9E9C98]"
        >
        {/* ── Brand emblem ── */}
        <button
          onClick={() => onNavigate("home")}
          className="flex shrink-0 items-center gap-1 pl-1 max-[360px]:pl-0.5 pr-1.5 max-[360px]:pr-1 sm:gap-1.5 sm:pl-2 sm:pr-2.5 py-1 text-[#F5F3EF] hover:text-[#C48446] transition-colors border-r border-white/8 group"
          title="Atelier Archai"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-[#C48446] transition-transform group-hover:scale-125" />
          <span className="font-sans font-semibold tracking-wider text-[10px] sm:text-[11px] hidden sm:inline">
            ATELIER
          </span>
        </button>

        {/* ── Nav items ── */}
        <div className="flex shrink-0 items-center gap-0 sm:gap-0.5">
          {navItems.map((item) => {
              const isActive = currentView === item.id;
              const itemButton = (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`relative flex shrink-0 items-center whitespace-nowrap px-1 max-[360px]:px-0.5 sm:px-3 py-1 sm:py-1.5 rounded-full transition-all duration-200 ${
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
              return (
                <React.Fragment key={item.id}>
                  {item.id === "model" && isProjectWorkspace && currentView === "plan" && onTogglePlanEditMode && (
                    renderEditModeToggle()
                  )}
                  {itemButton}
                </React.Fragment>
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
          className={`ml-0.5 max-[360px]:ml-0 sm:ml-1 flex shrink-0 items-center gap-1 px-1.5 max-[360px]:px-1 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-[9px] max-[360px]:text-[8px] sm:text-[11px] font-medium tracking-normal sm:tracking-wider transition-all duration-300 ${
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
    </>
  );
};
