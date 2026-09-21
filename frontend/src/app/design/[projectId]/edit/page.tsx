import React from "react";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";

export default async function DedicatedDesignEditPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectWorkspace projectId={projectId} initialTab="plan" />;
}
