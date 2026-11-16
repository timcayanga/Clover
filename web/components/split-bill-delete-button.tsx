"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SplitBillDeleteButtonProps = {
  billId: string;
};

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed");
  }
  return payload;
}

export function SplitBillDeleteButton({ billId }: SplitBillDeleteButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteBill = async () => {
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/split-bills/${billId}`, {
        method: "DELETE",
      });
      await readJsonResponse<{ ok: boolean }>(response);
      router.push("/split-bill");
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <button className="button button-danger button-small" type="button" onClick={() => void deleteBill()} disabled={isDeleting}>
      {isDeleting ? "Deleting..." : "Delete bill"}
    </button>
  );
}
