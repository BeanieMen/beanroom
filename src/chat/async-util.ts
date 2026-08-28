/**
 * A simple async mutex that serializes access to a shared resource.
 * Calls are run one-at-a-time in FIFO order.
 */
export class AsyncMutex {
  private chain: Promise<void> = Promise.resolve();

  run<T>(task: () => T | Promise<T>): Promise<T> {
    const result = this.chain.then(task);
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

/**
 * Coalescing async batcher. Rapid calls within `windowMs` are grouped into a
 * single flush. This prevents one file write per chat message when many users
 * are posting concurrently.
 */
export class CoalescingBatch {
  private pending: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private readonly queue: { items: string[]; resolve: () => void }[] = [];

  constructor(
    private readonly flushBatch: (items: string[]) => Promise<void>,
    private readonly windowMs = 15,
  ) {}

  push(line: string): void {
    this.pending.push(line);
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runFlush();
    }, this.windowMs);
  }

  async drain(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.runFlush();
  }

  private runFlush(): Promise<void> {
    if (this.flushing) {
      return new Promise<void>((resolve) => {
        this.queue.push({ items: [], resolve });
      });
    }
    const items = this.pending;
    this.pending = [];
    if (items.length === 0) {
      this.resolveWaiting();
      return Promise.resolve();
    }
    this.flushing = true;
    return this.flushBatch(items)
      .catch(() => {
        // A failed batch write should not kill the server; drop the batch.
      })
      .finally(() => {
        this.flushing = false;
        this.resolveWaiting();
        if (this.pending.length > 0) void this.runFlush();
      });
  }

  private resolveWaiting(): void {
    while (this.queue.length > 0) this.queue.shift()?.resolve();
  }
}

/**
 * True when the runtime is Bun, which has fast native async file APIs.
 */
export const IS_BUN = typeof Bun !== "undefined";
