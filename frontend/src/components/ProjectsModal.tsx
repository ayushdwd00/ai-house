"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FolderGit2, ArrowRight, X, Sparkles, Home, Trash2, AlertTriangle } from "lucide-react";
import { useProject, ProjectSummary } from "@/context/ProjectContext";

interface ProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProject: (projectId: string) => void;
  onStartNew: () => void;
}

export const ProjectsModal: React.FC<ProjectsModalProps> = ({
  isOpen,
  onClose,
  onSelectProject,
  onStartNew,
}) => {
  const { recentProjects, activeProject, deleteProject } = useProject();
  const [projectToDelete, setProjectToDelete] = useState<ProjectSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const isCurrentActive = activeProject?.id === projectToDelete.id;
      const { remainingCount, nextActiveId } = await deleteProject(projectToDelete.id);

      setProjectToDelete(null);
      setIsDeleting(false);

      if (isCurrentActive && nextActiveId) {
        onSelectProject(nextActiveId);
      }
    } catch (err) {
      console.error("Deletion error:", err);
      setIsDeleting(false);
      setDeleteError("Could not delete project. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-lg bg-[#12141A] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* Close button */}
          <button
            onClick={() => {
              setProjectToDelete(null);
              onClose();
            }}
            aria-label="Close archive"
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-[#9E9C98] hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="mb-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C48446]/10 border border-[#C48446]/20 text-[10px] font-mono tracking-widest text-[#C48446] uppercase mb-2">
              <FolderGit2 className="w-3 h-3" />
              ARCHITECTURAL ARCHIVE
            </span>
            <h2 className="text-2xl font-serif font-light text-[#F5F3EF]">
              Your Projects
            </h2>
            <p className="text-xs text-[#9E9C98] font-light mt-1">
              {recentProjects.length > 0
                ? "Select a residential study to open in the design workspace."
                : "No projects in your archive yet. Create your first residence."}
            </p>
          </div>

          {/* Project List */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 mb-6">
            {recentProjects.length === 0 && (
              <div className="py-12 text-center rounded-2xl bg-[#0A0B0E]/60 border border-white/5 p-6">
                <Home className="w-10 h-10 text-[#6B6964] mx-auto mb-3 opacity-60" />
                <p className="text-xs text-[#9E9C98] font-light mb-4">
                  No saved architectural designs found in this studio session.
                </p>
                <button
                  onClick={() => {
                    onClose();
                    onStartNew();
                  }}
                  className="px-5 py-2.5 rounded-full bg-[#C48446] text-[#0A0B0E] font-medium text-xs tracking-wider uppercase inline-flex items-center gap-2 hover:bg-[#D49354] transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>START NEW DESIGN</span>
                </button>
              </div>
            )}

            {recentProjects.map((p) => {
              const isActive = activeProject?.id === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    onSelectProject(p.id);
                    onClose();
                  }}
                  className={`group cursor-pointer p-4 rounded-xl border transition-all duration-200 flex items-center justify-between ${
                    isActive
                      ? "bg-[#C48446]/10 border-[#C48446]/40 text-[#F5F3EF]"
                      : "bg-[#171A22]/70 hover:bg-[#1C202B] border-white/5 hover:border-white/20 text-[#DCD8D0]"
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-serif font-medium truncate">{p.title}</span>
                      {isActive && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-[#C48446] text-[#0A0B0E] font-bold">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-[#8A8883]">
                      <span>{p.areaSqft ? `${p.areaSqft.toLocaleString()} SQ FT` : "Custom"}</span>
                      <span>·</span>
                      <span>{p.bedrooms || 3} BEDS</span>
                      <span>·</span>
                      <span>{p.floors || 1} {p.floors === 1 ? "FLOOR" : "FLOORS"}</span>
                    </div>
                  </div>

                  {/* Actions: Open Arrow + Subtle Delete Button */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      aria-label={`Open ${p.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectProject(p.id);
                        onClose();
                      }}
                      className="w-7 h-7 rounded-lg hover:bg-white/5 text-[#9E9C98] hover:text-[#F5F3EF] flex items-center justify-center transition-colors"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      aria-label={`Delete ${p.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setProjectToDelete(p);
                      }}
                      className="w-7 h-7 rounded-lg text-[#6E6C68] hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors opacity-70 group-hover:opacity-100"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Action */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-[11px] font-mono text-[#6B6964]">
              {recentProjects.length} {recentProjects.length === 1 ? "design" : "designs"} stored
            </span>
            <button
              onClick={() => {
                onClose();
                onStartNew();
              }}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-mono text-[#F5F3EF] border border-white/10 hover:border-white/25 transition-colors flex items-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#C48446]" />
              <span>CREATE NEW</span>
            </button>
          </div>

          {/* DELETE CONFIRMATION MODAL OVERLAY */}
          {projectToDelete && (
            <div
              className="absolute inset-0 z-30 flex items-center justify-center p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#151720] border border-white/15 rounded-2xl p-6 w-full max-w-sm shadow-2xl text-left space-y-4">
                <div className="flex items-center gap-2.5 text-amber-500/90 text-xs font-mono uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Delete this project?</span>
                </div>

                <div>
                  <h3 className="text-base font-serif text-[#F5F3EF] leading-snug">
                    &ldquo;{projectToDelete.title}&rdquo;
                  </h3>
                  {activeProject?.id === projectToDelete.id && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-[9px] font-mono uppercase bg-[#C48446]/20 border border-[#C48446]/40 text-[#C48446]">
                      Current Active Project
                    </span>
                  )}
                  <p className="text-xs text-[#9E9C98] font-light mt-2 leading-relaxed">
                    This saved design will be permanently removed.
                  </p>
                </div>

                {deleteError && (
                  <p className="text-xs text-red-400 font-mono">{deleteError}</p>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => {
                      setProjectToDelete(null);
                      setDeleteError(null);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-mono text-[#DCD8D0] hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={handleConfirmDelete}
                    className="px-4 py-2 rounded-xl text-xs font-mono text-red-300 hover:text-red-200 bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isDeleting ? "Deleting..." : "Delete"}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

