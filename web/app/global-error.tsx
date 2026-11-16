"use client";

import { ErrorView } from "./error";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <ErrorView error={error} reset={reset} source="global-error-boundary" />
      </body>
    </html>
  );
}
