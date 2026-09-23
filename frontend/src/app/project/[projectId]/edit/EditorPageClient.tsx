"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/context/ProjectContext";
import { ArchitecturalPlanRenderer } from "@/components/ArchitecturalPlanRenderer";
import { HouseLayout } from "@/types/house";
import { Loader2 } from "lucide-react";

interface EditorPageClientProps {
  projectId: string;
}

export const EditorPageClient: React.FC<EditorPageClientProps> = ({ projectId }) => {
  const router = useRouter();
  const { activeProject, loadProject, updateProject, isHydrated } = useProject();
  const [layout, setLayout] = useState<HouseLayout | null>(activeProject);
  const [loading, setLoading] = useState(!activeProject || activeProject.id !== projectId);
  const [activeFloorIndex, setActiveFloorIndex] = useState(0);

  useEffect(() => {
    if (!isHydrated) return;

    let isMounted = true;
    const resolveLayout = async () => {
      if (activeProject && activeProject.id === projectId) {
        setLayout(activeProject);
        setLoading(false);
        return;
      }

      setLoading(true);
      const loaded = await loadProject(projectId);
      if (isMounted) {
        if (loaded) {
          setLayout(loaded);
          setLoading(false);
        } else {
          router.replace("/");
        }
      }
    };

    resolveLayout();
    return () => {
      isMounted = false;
    };
  }, [isHydrated, projectId, activeProject, loadProject, router]);

  if (loading || !layout) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#ECEEF2] text-[#0F172A]">
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#C48446]" />
          <span className="text-xs font-mono tracking-widest uppercase">
            Opening Architectural Blueprint...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#ECEEF2]">
      <ArchitecturalPlanRenderer
        layout={layout}
        mode="edit"
        activeFloorIndex={activeFloorIndex}
        onSelectFloor={setActiveFloorIndex}
        onUpdateLayout={(updated) => {
          setLayout(updated);
          updateProject(updated);
        }}
        onSave={(saved) => {
          setLayout(saved);
          updateProject(saved);
        }}
        onBack={() => router.push(`/project/${projectId}/plan`)}
      />
    </div>
  );
};

