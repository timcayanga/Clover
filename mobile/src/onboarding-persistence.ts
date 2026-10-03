import type { OfflineStore } from "./offline/types";
export type SetupChoices = { experience: string; currency: string; locale: string; timeZone: string };
/** Per-identity queue; completion never depends on the onboarding screen staying mounted. */
export class OnboardingPersistence {
  pending: SetupChoices | null = null;
  completed = false;
  private flight: Promise<void> | null = null;
  private store: OfflineStore;
  private send: (choices: SetupChoices) => Promise<unknown>;
  constructor(store: OfflineStore, send: (choices: SetupChoices) => Promise<unknown>) { this.store = store; this.send = send; }
  async init() { this.pending = await this.store.get<SetupChoices>("pending-onboarding"); }
  async save(choices: SetupChoices) {
    await this.store.set("pending-onboarding", choices);
    this.pending = choices;
  }
  flush(): Promise<void> {
    if (this.flight) return this.flight;
    if (!this.pending) return Promise.resolve();
    const choices = this.pending;
    this.flight = (async () => {
      await this.send(choices);
      await this.store.remove("pending-onboarding");
      this.pending = null;
      this.completed = true;
    })().finally(() => { this.flight = null; });
    return this.flight;
  }
}
