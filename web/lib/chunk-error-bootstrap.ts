export const CHUNK_RECOVERY_QUERY_KEY = "__clover_chunk_retry";

export function getChunkRecoveryBootstrapScript(buildId: string) {
  return `
    (() => {
      const buildId = ${JSON.stringify(buildId)};
      const queryKey = ${JSON.stringify(CHUNK_RECOVERY_QUERY_KEY)};
      const recoveryFlag = "clover:chunk-error-recovered";
      const chunkPattern = /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i;
      const chunkUrlPattern = /\\/_next\\/static\\/chunks\\//i;

      const messageFrom = (value) => {
        if (typeof value === "string") return value;
        if (value && typeof value.message === "string") return value.message;
        if (value && value.reason) return messageFrom(value.reason);
        return "";
      };

      const recover = async () => {
        try {
          const recoveryKey = recoveryFlag + ":" + buildId + ":" + window.location.pathname;
          if (window.sessionStorage.getItem(recoveryKey) === "1") return;
          window.sessionStorage.setItem(recoveryKey, "1");

          if ("caches" in window) {
            const cacheKeys = await window.caches.keys();
            await Promise.all(
              cacheKeys
                .filter((key) => key.startsWith("clover-static-"))
                .map((key) => window.caches.delete(key)),
            );
          }

          if ("serviceWorker" in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((registration) => registration.update()));
          }

          const recoveryUrl = new URL(window.location.href);
          recoveryUrl.searchParams.set(queryKey, buildId);
          window.location.replace(recoveryUrl.toString());
        } catch (_) {
          window.location.reload();
        }
      };

      window.addEventListener("error", (event) => {
        const target = event.target;
        const sourceUrl = target && typeof target.src === "string" ? target.src : "";
        if (chunkPattern.test(messageFrom(event)) || chunkUrlPattern.test(sourceUrl)) recover();
      }, true);

      window.addEventListener("unhandledrejection", (event) => {
        if (chunkPattern.test(messageFrom(event))) recover();
      });

      window.addEventListener("load", () => {
        try {
          const loadedUrl = new URL(window.location.href);
          if (!loadedUrl.searchParams.has(queryKey)) return;
          loadedUrl.searchParams.delete(queryKey);
          window.history.replaceState(window.history.state, "", loadedUrl.toString());
        } catch (_) {}
      }, { once: true });
    })();
  `;
}
