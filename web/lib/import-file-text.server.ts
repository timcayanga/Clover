import { GetObjectCommand } from "@aws-sdk/client-s3";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { getEnv } from "@/lib/env";
import { getR2Client } from "@/lib/s3";

const decodeBody = async (body: unknown) => {
  if (!body) {
    throw new Error("Unable to read imported file.");
  }

  if (body instanceof Uint8Array) {
    return body;
  }

  if (typeof body === "object" && body !== null && "transformToByteArray" in body && typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function") {
    return new Uint8Array(await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray());
  }

  if (typeof body === "object" && body !== null && Symbol.asyncIterator in body) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
      if (typeof chunk === "string") {
        chunks.push(new TextEncoder().encode(chunk));
      } else if (chunk instanceof Uint8Array) {
        chunks.push(chunk);
      } else {
        chunks.push(new Uint8Array(chunk));
      }
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }

  throw new Error("Unable to read imported file.");
};

export const downloadImportObject = async (storageKey: string) => {
  const env = getEnv();
  if (!env.R2_BUCKET_NAME) {
    throw new Error("Missing bucket name");
  }

  const response = await getR2Client().send(
    new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: storageKey,
    })
  );

  return decodeBody(response.Body);
};

const extractTextFromPdfBytes = async (data: Uint8Array, password?: string) => {
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
  }

  return pages.join("\n");
};

export const readImportedFileText = async (
  params: { storageKey: string; fileType: string; fileName: string },
  password?: string
) => {
  const lowerName = `${params.fileType} ${params.fileName}`.toLowerCase();
  const bytes = await downloadImportObject(params.storageKey);

  if (lowerName.endsWith(".csv") || lowerName.endsWith(".tsv") || lowerName.endsWith(".txt") || /csv|tsv|txt/.test(lowerName)) {
    return new TextDecoder().decode(bytes);
  }

  return extractTextFromPdfBytes(bytes, password);
};
