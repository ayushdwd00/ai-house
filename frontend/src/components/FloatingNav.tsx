"use client";

import React from "react";
import { motion } from "framer-motion";
import { Sparkles, FolderGit2 } from "lucide-react";

export type NavView = "home" | "plan" | "model" | "structure" | "estimate" | "create" | "projects";

interface FloatingNavProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  isProjectWorkspace?: boolean;
  hasProject?: boolean;
  onOpenProjects?: () => void;
  onOpenVastuAudit?: () => void;
  hasVastuResult?: boolean;
}

export const FloatingNav: React.FC<FloatingNavProps> = ({
  currentView,
  onNavigate,
  isProjectWorkspace = false,
  hasProject = false,
  onOpenProjects,
  onOpenVastuAudit,
  hasVastuResult = false,
}) => {
  // Navigation items strictly depend on whether we are in a project workspace or home/initial state
  // On Home (or before a project workspace is active): show strictly HOME | PROJECTS
  // Inside Project Workspace: show HOME | PLAN | MODEL | STRUCTURE | ESTIMATE
  const navItems: { id: NavView; label: string }[] = isProjectWorkspace
    ? [
        { id: "home", label: "HOME" },
        { id: "plan", label: "PLAN" },
        { id: "model", label: "MODEL" },
        { id: "structure", label: "STRUCTURE" },
        { id: "estimate", label: "ESTIMATE" },
      ]
    : [
        { id: "home", label: "HOME" },
        { id: "projects", label: "PROJECTS" },
      ];

  const handleNavClick = (id: NavView) => {
    if (id === "projects" && onOpenProjects) {
      onOpenProjects();
    } else {
      onNavigate(id);
    }
  };

  return (
    <header className="fixed top-4 sm:top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none max-w-[calc(100vw-16px)]">
      <nav
        aria-label="Studio Navigation"
        className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-full bg-[#12141A]/90 backdrop-blur-md border border-white/10 shadow-2xl shadow-black/40 text-[10px] sm:text-[11px] font-mono tracking-wider sm:tracking-widest text-[#9E9C98]"
      >
        {/* Atelier Brand Emblem */}
        <button
          onClick={() => onNavigate("home")}
          className="flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2 pr-2 sm:pr-3 py-1 text-[#F5F3EF] hover:text-[#C48446] transition-colors border-r border-white/10 group"
          title="Atelier Archai"
        >
          <div className="w-2 h-2 rounded-full bg-[#C48446] transition-transform group-hover:scale-125" />
          <span className="font-sans font-semibold tracking-wider text-[11px] sm:text-xs">ATELIER</span>
        </button>

        {/* View Links */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`relative px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all duration-200 ${
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

        {/* Vastu Audit Pill (shown only in project workspace if active layout has Vastu) */}
        {isProjectWorkspace && hasVastuResult && onOpenVastuAudit && (
          <button
            onClick={onOpenVastuAudit}
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#C48446]/15 hover:bg-[#C48446]/25 border border-[#C48446]/30 text-[#C48446] text-[10px] font-mono transition-colors"
            title="View Vastu Compliance Audit"
          >
            <span>VASTU</span>
          </button>
        )}

        {/* CREATE Primary Action Button */}
        <button
          onClick={() => onNavigate("create")}
          className={`ml-0.5 sm:ml-1.5 flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-[11px] font-medium tracking-wider transition-all duration-300 ${
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
