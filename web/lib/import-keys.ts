export const buildImportKey = (workspaceId: string, fileName: string) => {
  const safeName = fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `workspaces/${workspaceId}/imports/${Date.now()}-${safeName || "upload"}`;
};
