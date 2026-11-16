/** Serialize local inference to respect device resources, independently of cloud quotas. */
export class LocalModelQueue {
  private queue: Promise<unknown> = Promise.resolve();
  use<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }
}
