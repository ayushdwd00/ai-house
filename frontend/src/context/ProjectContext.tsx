"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { HouseLayout } from "@/types/house";
import { validateAndSanitizeHouseLayout } from "@/utils/layoutValidator";
import { fetchProjectById, fetchProjectSummaries, saveProjectToServer, deleteProjectApi } from "@/utils/api";

export const STORAGE_KEY = "atelier_archai_saved_layout";
export const RECENT_PROJECTS_KEY = "atelier_archai_recent_projects";
export const PROJECT_STORAGE_PREFIX = "atelier_archai_proj_";

export interface ProjectSummary {
  id: string;
  title: string;
  updatedAt: string;
  areaSqft?: number;
  bedrooms?: number;
  floors?: number;
}

function isProjectSummary(value: unknown): value is ProjectSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const summary = value as Record<string, unknown>;
  return typeof summary.id === "string"
    && typeof summary.title === "string"
    && typeof summary.updatedAt === "string";
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
  refreshProjects: () => Promise<void>;
  deleteProject: (id: string) => Promise<{ remainingCount: number; nextActiveId: string | null }>;
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

  // Keep a stable ref to activeProject to avoid stale closures in callbacks
  const activeProjectRef = useRef<HouseLayout | null>(null);
  useEffect(() => {
    activeProjectRef.current = activeProject;
  }, [activeProject]);

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
            // Ensure indexed in multi-project local cache
            try {
              localStorage.setItem(PROJECT_STORAGE_PREFIX + sanitized.id, JSON.stringify(sanitized));
            } catch (_) {}
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
        const updated = [summary, ...filtered].slice(0, 15);
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
      const layoutWithId = { ...sanitized, id: pid, project_id: pid };

      setActiveProject(layoutWithId);
      setProjectId(pid);
      setProjectStatus("ready");

      try {
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(layoutWithId));
          localStorage.setItem(PROJECT_STORAGE_PREFIX + pid, JSON.stringify(layoutWithId));
        }
      } catch (e) {
        console.warn("Could not persist active layout:", e);
      }

      saveRecentProject(layoutWithId);

      // Asynchronously mirror project persistence on server
      saveProjectToServer(layoutWithId).catch((err) => {
        console.warn("[STORAGE] Server sync failed for created project:", err);
      });

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
          localStorage.setItem(PROJECT_STORAGE_PREFIX + sanitized.id, JSON.stringify(sanitized));
        }
      } catch (e) {
        console.warn("Could not persist updated layout:", e);
      }

      saveRecentProject(sanitized);

      // Asynchronously mirror update on server
      saveProjectToServer(sanitized).catch((err) => {
        console.warn("[STORAGE] Server sync failed for updated project:", err);
      });
    },
    [saveRecentProject]
  );

  const loadProject = useCallback(
    async (id: string): Promise<HouseLayout | null> => {
      // 1. If currently active project matches, return it instantly (0ms)
      const current = activeProjectRef.current;
      if (current && current.id === id) {
        return current;
      }

      // 2. Check dedicated multi-project local cache (0ms instant retrieval)
      try {
        if (typeof window !== "undefined") {
          const cachedJson = localStorage.getItem(PROJECT_STORAGE_PREFIX + id);
          if (cachedJson) {
            const parsed = JSON.parse(cachedJson);
            const sanitized = validateAndSanitizeHouseLayout(parsed);
            if (sanitized) {
              setActiveProject(sanitized);
              setProjectId(sanitized.id);
              setProjectStatus("ready");
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
              } catch (_) {}
              return sanitized;
            }
          }
        }
      } catch (e) {
        console.warn("Error reading cached project from storage:", e);
      }

      // 3. Check active layout key
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
                try {
                  localStorage.setItem(PROJECT_STORAGE_PREFIX + id, JSON.stringify(sanitized));
                } catch (_) {}
                return sanitized;
              }
            }
          }
        }
      } catch (_) {}

      // 4. Fallback to fetching from backend /api/projects/{id}
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
              localStorage.setItem(PROJECT_STORAGE_PREFIX + id, JSON.stringify(sanitized));
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
    [saveRecentProject]
  );

  const refreshProjects = useCallback(async () => {
    const serverProjects = await fetchProjectSummaries();
    const merged = new Map<string, ProjectSummary>();
    try {
      const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          for (const project of parsed) {
            if (isProjectSummary(project)) {
              merged.set(project.id, project);
            }
          }
        }
      }
    } catch (error) {
      console.warn("Could not read cached project metadata:", error);
    }
    for (const project of serverProjects) merged.set(project.id, project);
    const updated = [...merged.values()].sort(
      (first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt)
    );
    setRecentProjects(updated);
    try {
      localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated.slice(0, 100)));
    } catch (error) {
      console.warn("Could not cache refreshed project metadata:", error);
    }
  }, []);

  const deleteProject = useCallback(
    async (id: string): Promise<{ remainingCount: number; nextActiveId: string | null }> => {
      await deleteProjectApi(id);

      // Update local state only after the backend confirms deletion.
      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem(PROJECT_STORAGE_PREFIX + id);
        }
      } catch (error) {
        console.warn(`Could not remove cached project ${id}:`, error);
      }

      const nextRecents = recentProjects.filter((project) => project.id !== id);
      setRecentProjects(nextRecents);
      try {
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(nextRecents));
      } catch (error) {
        console.warn("Could not update cached project metadata:", error);
      }

      // Clear the active project before navigating away from its workspace.
      let nextActiveId: string | null = null;
      const current = activeProjectRef.current;
      if (current && current.id === id) {
        const candidate = nextRecents.find((p) => p.id !== id);
        if (candidate) {
          nextActiveId = candidate.id;
        }
        setActiveProject(null);
        setProjectId(null);
        setProjectStatus("idle");
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
          console.warn("Could not clear the deleted active project cache:", error);
        }
      } else {
        nextActiveId = current?.id || null;
      }

      return {
        remainingCount: nextRecents.length,
        nextActiveId,
      };
    },
    [recentProjects]
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
        refreshProjects,
        deleteProject,
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
