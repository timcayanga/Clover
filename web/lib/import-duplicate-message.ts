export const formatDuplicateImportMessage = (fileName: string, accountName?: string | null) => {
  const target = accountName?.trim() ? accountName.trim() : "this workspace";
  return `${fileName} was already imported in ${target} and was skipped.`;
};
