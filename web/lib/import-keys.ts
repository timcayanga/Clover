import { getDeploymentEnvironment } from "@/lib/deployment-environment";

export const buildImportKey = (workspaceId: string, fileName: string) => {
  const safeName = fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const environmentPrefix = getDeploymentEnvironment() === "staging" ? "staging/" : "";

  // Production keeps its legacy path. New staging objects are isolated even when
  // both deployments temporarily share an R2 bucket.
  return `${environmentPrefix}workspaces/${workspaceId}/imports/${Date.now()}-${safeName || "upload"}`;
};
