import type { OfflineStore } from "./types";
export type Grant = {
  id: string;
  issued: number;
  used: number;
  expiresAt: string;
  issuedAt: string;
};
export type Allowance = {
  grant: Grant | null;
  monthlyLimit: number;
  resetsAt: string;
  serverTime: string;
};
export class LocalAllowance {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private store: OfflineStore,
    private now = () => Date.now(),
  ) {}
  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => {});
    return next;
  }
  async get() {
    return this.store.get<Allowance>("local-allowance");
  }
  async save(value: Allowance) {
    return this.locked(async () => {
      const previous = await this.get();
      if (previous?.grant?.id === value.grant?.id && value.grant)
        value.grant.used = Math.max(value.grant.used, previous!.grant!.used);
      await this.store.set("local-allowance", value);
    });
  }
  async use<T>(run: () => Promise<T>): Promise<T> {
    return this.locked(async () => {
      const allowance = await this.get(),
        grant = allowance?.grant;
      if (
        !grant ||
        this.now() >= Date.parse(grant.expiresAt) ||
        this.now() < Date.parse(grant.issuedAt) - 60000 ||
        grant.used >= grant.issued
      )
        throw new Error(
          "Connect to refresh your on-device allowance. Local calculations and transcription remain available.",
        );
      grant.used++;
      await this.store.set("local-allowance", allowance);
      try {
        return await run();
      } catch (e) {
        grant.used--;
        await this.store.set("local-allowance", allowance);
        throw e;
      }
    });
  }
}
