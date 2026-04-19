"use client";

import { pdfjs } from "@/lib/pdfjs";

type ProgressCallback = (progress: {
  pageNumber: number;
  totalPages: number;
}) => void;

const yieldToPaint = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

export const extractTextFromFile = async (
  file: File,
  password?: string,
  onProgress?: ProgressCallback
) => {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".csv") || lowerName.endsWith(".tsv") || lowerName.endsWith(".txt")) {
    return file.text();
  }

  if (lowerName.endsWith(".pdf")) {
    const data = new Uint8Array(await file.arrayBuffer());
    const options = password ? { data, password } : { data };
    const loadingTask = pdfjs.getDocument(options as any);
    const pdf = await loadingTask.promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = new Map<number, { x: number; text: string }[]>();

      for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
        if (typeof item.str !== "string" || !item.str.trim()) {
          continue;
        }

        const y = Math.round(Number(item.transform?.[5] ?? 0));
        const x = Number(item.transform?.[4] ?? 0);
        const row = lines.get(y) ?? [];
        row.push({ x, text: item.str.trim() });
        lines.set(y, row);
      }

      const text = Array.from(lines.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([, row]) => row.sort((a, b) => a.x - b.x).map((entry) => entry.text).join(" "))
        .join("\n");
      pages.push(text);

      onProgress?.({ pageNumber, totalPages: pdf.numPages });
      if (pageNumber < pdf.numPages) {
        await yieldToPaint();
      }
    }

    return pages.join("\n");
  }

  throw new Error("Only CSV, TSV, TXT, and PDF files are supported.");
};
