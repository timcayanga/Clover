import type { OpticalTextLine } from "../../../shared/device-text-evidence";
import { requireOptionalNativeModule } from "expo-modules-core";
export type LocalCapability = {
  model: "available" | "downloadable" | "downloading" | "unavailable";
  provider: string;
  detail: string;
};
export type ExtractedText = {
  text: string;
  opticalLines?: OpticalTextLine[];
  pagesRead: number;
  totalPages: number;
  complete: boolean;
};
export const CloverLocalAI = requireOptionalNativeModule<{
  recoverableApplePurchase?(): Promise<string>;
  protectOfflineDirectory?(uri: string): Promise<void>;
  capabilities(): Promise<LocalCapability>;
  generate(prompt: string): Promise<string>;
  download(): Promise<void>;
  extractPhotoTextFast?(uri: string): Promise<ExtractedText>;
  extractText(uri: string): Promise<ExtractedText>;
}>("CloverLocalAI");
