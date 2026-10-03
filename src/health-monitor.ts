import { nodeId } from "./node-id";
import { HealthChecker, HealthOptions, NodeConfig, Route } from "./types";

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("health check timed out")),
      ms,
    );
    promise.then(
      (value) => (clearTimeout(timer), resolve(value)),
      (error) => (clearTimeout(timer), reject(error)),
    );
  });

/**
 * Probes every live node on an interval with the user's `HealthChecker` and
 * reports nodes that fail `failureThreshold` probes in a row.
 */
export class HealthMonitor<C> {
  private checker: HealthChecker<C>;
  private intervalMs: number;
  private timeoutMs: number;
  private failureThreshold: number;
  private timer?: NodeJS.Timeout;
  private failures = new Map<string, number>();
  private probing = new Set<string>();

  constructor(
    options: HealthOptions<C>,
    private nodes: () => Route<C>[],
    private onUnhealthy: (node: NodeConfig, client: C) => Promise<void>,
  ) {
    this.checker = options.checker;
    this.intervalMs = options.intervalMs ?? 5000;
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.failureThreshold = options.failureThreshold ?? 2;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.failures.clear();
  }

  /** Runs one probe round; resolves when every probe has settled. */
  async tick() {
    await Promise.all(this.nodes().map((route) => this.probe(route)));
  }

  private async probe({ node, client }: Route<C>) {
    const id = nodeId(node);
    if (this.probing.has(id)) return; // previous probe still in flight
    this.probing.add(id);

    let healthy: boolean;
    try {
      const result = await withTimeout(
        Promise.resolve(this.checker.check(client, node)),
        this.timeoutMs,
      );
      healthy = result !== false;
    } catch {
      healthy = false;
    } finally {
      this.probing.delete(id);
    }

    if (healthy) {
      this.failures.delete(id);
      return;
    }
    const count = (this.failures.get(id) ?? 0) + 1;
    if (count < this.failureThreshold) {
      this.failures.set(id, count);
      return;
    }
    this.failures.delete(id);
    await this.onUnhealthy(node, client);
  }
}
