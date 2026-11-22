import type { Logger } from '../logger.js';
import type { DeliveryRepository } from '../db/deliveryRepository.js';
import type { CallbackService } from './callbackService.js';

/**
 * Durable callback retry loop. State lives in notification_deliveries, so pending callbacks
 * are resumed after a restart; the in-memory timer only decides when to poll.
 */
export class CallbackRetryWorker {
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = true;

  constructor(
    private readonly repository: DeliveryRepository,
    private readonly callbacks: CallbackService,
    private readonly logger: Logger,
    private readonly options: { pollIntervalMs: number; batchSize: number; claimLeaseMs: number },
  ) {}

  start(): void {
    this.stopped = false;
    const tick = (): void => {
      if (this.stopped) return;
      this.running = this.runOnce()
        .then(() => undefined)
        .catch((error: unknown) => this.logger.error({ err: error instanceof Error ? error.message : String(error), errorCategory: 'DATABASE' }, 'callback retry poll failed'))
        .finally(() => {
          if (!this.stopped) this.timer = setTimeout(tick, this.options.pollIntervalMs);
        });
    };
    tick();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }

  /** Processes one batch of due callbacks; returns how many were attempted. */
  async runOnce(): Promise<number> {
    const due = await this.repository.claimDueCallbacks(this.options.batchSize, this.options.claimLeaseMs);
    for (const record of due) {
      await this.callbacks.attempt(record);
    }
    return due.length;
  }
}
