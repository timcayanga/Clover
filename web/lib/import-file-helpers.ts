type AccountOptionLike = {
  id: string;
  name: string;
  institution: string | null;
  type: string;
};

type FileLike = {
  name: string;
  size: number;
  lastModified: number;
  type: string;
};

export const fileKey = (file: FileLike) => `${file.name}:${file.size}:${file.lastModified}`;

export const fileTypeLabel = (file: Pick<FileLike, "name" | "type">) => {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".pdf") || file.type === "application/pdf") return "PDF";
  if (lowerName.endsWith(".csv")) return "CSV";
  if (lowerName.endsWith(".tsv")) return "TSV";
  if (
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".webp") ||
    lowerName.endsWith(".heic") ||
    lowerName.endsWith(".heif")
  ) {
    return "Image";
  }
  return "File";
};

export const isImageImportFile = (file: Pick<FileLike, "name" | "type">) =>
  /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name.toLowerCase()) || file.type.startsWith("image/");

export const fileAnalyticsBase = (file: Pick<FileLike, "name" | "size" | "type">, workspaceId: string) => ({
  workspace_id: workspaceId || null,
  file_name: file.name,
  file_type: fileTypeLabel(file),
  file_size_bytes: file.size,
});

export const resolveCashAccountOption = <TAccount extends AccountOptionLike>(accounts: TAccount[]) =>
  accounts.find((account) => {
    const name = account.name.trim().toLowerCase();
    const institution = (account.institution ?? "").trim().toLowerCase();
    const type = account.type.trim().toLowerCase();
    return name === "cash" || institution === "cash" || type === "cash";
  }) ?? null;

export const findAccountOptionById = <TAccount extends AccountOptionLike>(accounts: TAccount[], accountId: string | null) =>
  accountId ? accounts.find((account) => account.id === accountId) ?? null : null;
