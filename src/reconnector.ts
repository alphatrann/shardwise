import { nodeId } from "./node-id";
import { backoffDelay } from "./retry";
import { NodeConfig, RetryOptions } from "./types";

/**
 * Keeps trying to bring a downed node back, with capped exponential backoff,
 * until `attempt` succeeds or the node is cancelled.
 */
export class Reconnector {
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private attempt: (node: NodeConfig) => Promise<void>,
    private retry: RetryOptions,
  ) {}

  schedule(node: NodeConfig, attemptNo = 0) {
    const id = nodeId(node);
    if (attemptNo === 0 && this.timers.has(id)) return;

    const timer = setTimeout(
      async () => {
        this.timers.delete(id);
        try {
          await this.attempt(node);
        } catch {
          this.schedule(node, attemptNo + 1);
        }
      },
      backoffDelay(attemptNo, this.retry),
    );
    timer.unref();
    this.timers.set(id, timer);
  }

  cancel(node: NodeConfig) {
    const id = nodeId(node);
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
  }

  cancelAll() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
