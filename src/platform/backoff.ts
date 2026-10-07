/** One in-flight update; retry outages at 0.5, 1, 2, 4, then 8 second intervals.
 * No timers survive a character switch. Errors remain visible until recovery.
 */
export class IpcBackoff {
  private busy = false;
  private failures = 0;
  private retryAt = 0;
  private disposed = false;
  constructor(private readonly now: () => number = () => performance.now()) {}

  async run(task: () => Promise<unknown>, failure: (error: unknown) => void, recovered: () => void): Promise<void> {
    if (this.disposed || this.busy || this.now() < this.retryAt) return;
    this.busy = true;
    try {
      await task();
      if (this.disposed) return;
      if (this.failures) recovered();
      this.failures = 0; this.retryAt = 0;
    } catch (error) {
      if (this.disposed) return;
      this.retryAt = this.now() + Math.min(8000, 500 * 2 ** Math.min(this.failures, 4));
      if (this.failures++ === 0) failure(error);
    } finally { this.busy = false; }
  }
  dispose(): void { this.disposed = true; }
}
