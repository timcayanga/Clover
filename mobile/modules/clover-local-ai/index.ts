import { requireOptionalNativeModule } from "expo-modules-core";
export type LocalCapability = {
  model: "available" | "downloadable" | "downloading" | "unavailable";
  provider: string;
  detail: string;
};
export type ExtractedText = {
  text: string;
  pagesRead: number;
  totalPages: number;
  complete: boolean;
};
export const CloverLocalAI = requireOptionalNativeModule<{
  protectOfflineDirectory?(uri: string): Promise<void>;
  capabilities(): Promise<LocalCapability>;
  generate(prompt: string): Promise<string>;
  download(): Promise<void>;
  extractText(uri: string): Promise<ExtractedText>;
}>("CloverLocalAI");
