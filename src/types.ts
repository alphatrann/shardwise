export interface NodeAddress {
  host: string;
  port: number;
}

export interface NodeConfig extends NodeAddress {
  /**
   * Ring points for this node. More points means a larger share of the keys,
   * so size it relative to the other nodes. Defaults to the router's `vnodes`.
   */
  vnodes?: number;
}

export interface RetryOptions {
  /** Retries after the first attempt. */
  maxRetries: number;
  /** Delay before the first retry; doubles on each subsequent one. */
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface Route<C> {
  node: NodeConfig;
  client: C;
}

/** Your own liveness probe for a node's client (PING, SELECT 1, a HEAD request...). */
export interface HealthChecker<C> {
  /** Resolve if healthy. Reject, throw, or resolve `false` if not. */
  check(client: C, node: NodeAddress): Promise<boolean | void>;
}

export interface HealthOptions<C> {
  checker: HealthChecker<C>;
  /** Time between probe rounds. Default 5000. */
  intervalMs?: number;
  /** A probe slower than this counts as a failure. Default 2000. */
  timeoutMs?: number;
  /** Consecutive failures before a node is taken out of the ring. Default 2. */
  failureThreshold?: number;
}
