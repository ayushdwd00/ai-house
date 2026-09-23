import React from "react";
import { EditorPageClient } from "./EditorPageClient";

export default async function ProjectEditPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <EditorPageClient projectId={projectId} />;
}
