"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { HouseLayout } from "@/types/house";
import { validateAndSanitizeHouseLayout } from "@/utils/layoutValidator";
import { fetchProjectById } from "@/utils/api";

export const STORAGE_KEY = "atelier_archai_saved_layout";
export const RECENT_PROJECTS_KEY = "atelier_archai_recent_projects";

export interface ProjectSummary {
  id: string;
  title: string;
  updatedAt: string;
  areaSqft?: number;
  bedrooms?: number;
  floors?: number;
}

interface ProjectContextValue {
  activeProject: HouseLayout | null;
  projectId: string | null;
  projectStatus: "idle" | "creating" | "ready" | "error";
  recentProjects: ProjectSummary[];
  isHydrated: boolean;
  createProject: (layout: HouseLayout) => string;
  updateProject: (layout: HouseLayout) => void;
  loadProject: (id: string) => Promise<HouseLayout | null>;
  clearActiveProject: () => void;
  setProjectStatus: (status: "idle" | "creating" | "ready" | "error") => void;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeProject, setActiveProject] = useState<HouseLayout | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState<"idle" | "creating" | "ready" | "error">("idle");
  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // Deterministic hydration from localStorage only after client mount
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          const sanitized = validateAndSanitizeHouseLayout(parsed);
          if (sanitized) {
            setActiveProject(sanitized);
            setProjectId(sanitized.id);
            setProjectStatus("ready");
          }
        }

        const savedRecent = localStorage.getItem(RECENT_PROJECTS_KEY);
        if (savedRecent) {
          const parsedRecent = JSON.parse(savedRecent);
          if (Array.isArray(parsedRecent)) {
            setRecentProjects(parsedRecent);
          }
        }
      }
    } catch (e) {
      console.warn("Could not hydrate saved project:", e);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  const saveRecentProject = useCallback((layout: HouseLayout) => {
    try {
      const summary: ProjectSummary = {
        id: layout.id,
        title: layout.title || "Residential Design",
        updatedAt: new Date().toISOString(),
        areaSqft: layout.stats?.total_area_sqft || 0,
        bedrooms: layout.stats?.bedroom_count || 3,
        floors: layout.num_floors || 1,
      };

      setRecentProjects((prev) => {
        const filtered = prev.filter((p) => p.id !== layout.id);
        const updated = [summary, ...filtered].slice(0, 10);
        try {
          localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
        } catch (_) {}
        return updated;
      });
    } catch (e) {
      console.warn("Could not update recent projects:", e);
    }
  }, []);

  const createProject = useCallback(
    (newLayout: HouseLayout): string => {
      const sanitized = validateAndSanitizeHouseLayout(newLayout) || newLayout;
      const pid = sanitized.id || `proj_${Date.now().toString(36)}`;
      const layoutWithId = { ...sanitized, id: pid };

      setActiveProject(layoutWithId);
      setProjectId(pid);
      setProjectStatus("ready");

      try {
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(layoutWithId));
        }
      } catch (e) {
        console.warn("Could not persist active layout:", e);
      }

      saveRecentProject(layoutWithId);
      return pid;
    },
    [saveRecentProject]
  );

  const updateProject = useCallback(
    (newLayout: HouseLayout) => {
      const sanitized = validateAndSanitizeHouseLayout(newLayout) || newLayout;
      setActiveProject(sanitized);
      setProjectId(sanitized.id);

      try {
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
        }
      } catch (e) {
        console.warn("Could not persist updated layout:", e);
      }

      saveRecentProject(sanitized);
    },
    [saveRecentProject]
  );

  const loadProject = useCallback(
    async (id: string): Promise<HouseLayout | null> => {
      // 1. If currently active project matches, return it
      if (activeProject && activeProject.id === id) {
        return activeProject;
      }

      // 2. Check localStorage
      try {
        if (typeof window !== "undefined") {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.id === id) {
              const sanitized = validateAndSanitizeHouseLayout(parsed);
              if (sanitized) {
                setActiveProject(sanitized);
                setProjectId(sanitized.id);
                setProjectStatus("ready");
                return sanitized;
              }
            }
          }
        }
      } catch (_) {}

      // 3. Try fetching from backend /api/projects/{id}
      try {
        const data = await fetchProjectById(id);
        if (data) {
          const sanitized = validateAndSanitizeHouseLayout(data);
          if (sanitized) {
            setActiveProject(sanitized);
            setProjectId(sanitized.id);
            setProjectStatus("ready");
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
            } catch (_) {}
            saveRecentProject(sanitized);
            return sanitized;
          }
        }
      } catch (err) {
        console.warn(`Could not load project ${id} from server:`, err);
      }

      return null;
    },
    [activeProject, saveRecentProject]
  );

  const clearActiveProject = useCallback(() => {
    setActiveProject(null);
    setProjectId(null);
    setProjectStatus("idle");
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (_) {}
  }, []);

  return (
    <ProjectContext.Provider
      value={{
        activeProject,
        projectId,
        projectStatus,
        recentProjects,
        isHydrated,
        createProject,
        updateProject,
        loadProject,
        clearActiveProject,
        setProjectStatus,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = (): ProjectContextValue => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
};
