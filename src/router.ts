import { HealthMonitor } from "./health-monitor";
import { HashFn } from "./hash";
import { NodeRegistry } from "./node-registry";
import { nodeId } from "./node-id";
import { Reconnector } from "./reconnector";
import { HashRing } from "./ring";
import { DEFAULT_RETRY, withRetry } from "./retry";
import {
  HealthOptions,
  NodeAddress,
  NodeConfig,
  RetryOptions,
  Route,
} from "./types";

export interface RouterOptions<C> {
  /** Opens a client for a node. Bring any driver: ioredis, pg, a raw socket... */
  connect: (node: NodeAddress) => Promise<C>;
  /** Closes a client. Called on removeNode, markDown and close. */
  disconnect?: (client: C, node: NodeAddress) => Promise<unknown> | unknown;
  /** Default ring points per node; a node's own `vnodes` overrides it. Default 100. */
  vnodes?: number;
  /** Total copies per key, leader included. Default 3. */
  replicas?: number;
  retry?: Partial<RetryOptions>;
  /** Periodic liveness probing. Omit to only react to failed calls. */
  health?: HealthOptions<C>;
  hash?: HashFn;
  /** Whether a failed call should take the node out of the ring. Default: always. */
  shouldMarkDown?: (error: unknown, node: NodeAddress) => boolean;
}

export class NoNodesError extends Error {
  constructor() {
    super("no nodes available");
  }
}

/**
 * Routes keys to nodes with consistent hashing, backed by a node registry,
 * a background reconnector and an optional health monitor.
 */
export class Router<C> {
  private ring: HashRing;
  private registry = new NodeRegistry<C>();
  private reconnector: Reconnector;
  private monitor?: HealthMonitor<C>;
  private retry: RetryOptions;
  private vnodes: number;
  private replicas: number;

  constructor(private options: RouterOptions<C>) {
    this.retry = { ...DEFAULT_RETRY, ...options.retry };
    this.vnodes = options.vnodes ?? 100;
    this.replicas = options.replicas ?? 3;
    this.ring = new HashRing(options.hash);
    this.reconnector = new Reconnector((node) => this.join(node), this.retry);
    if (options.health) {
      this.monitor = new HealthMonitor(
        options.health,
        () => this.registry.all(),
        (node, client) => this.markDownIfCurrent(node, client),
      );
    }
  }

  /** Connects (with retry) and adds the node to the ring. Throws if it never connects. */
  async addNode(node: NodeConfig) {
    if (this.registry.has(nodeId(node))) return;
    await withRetry(() => this.join(node), this.retry);
  }

  async removeNode(node: NodeAddress) {
    this.reconnector.cancel(node);
    await this.leave(node);
  }

  /** Takes a node out of the ring and starts trying to bring it back. */
  async markDown(node: NodeAddress) {
    const entry = this.registry.get(nodeId(node));
    if (!entry) return;
    await this.leave(node);
    this.reconnector.schedule(entry.node);
  }

  /** The node and client responsible for `key`. */
  route(key: string): Route<C> {
    return this.routeAll(key, 1)[0];
  }

  /** Leader-first routes for `key`; fewer than `count` if fewer nodes are up. */
  routeAll(key: string, count = this.replicas): Route<C>[] {
    const routes = this.ring
      .getNodes(key, count)
      .map((id) => this.registry.get(id)!);
    if (routes.length === 0) throw new NoNodesError();
    return routes;
  }

  /** Runs `fn` on the leader, falling over to the next replica clockwise if a node fails. */
  async execute<T>(
    key: string,
    fn: (client: C, node: NodeAddress) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (const { node, client } of this.routeAll(key)) {
      try {
        return await fn(client, node);
      } catch (error) {
        lastError = error;
        await this.handleFailure(error, node);
      }
    }
    throw lastError;
  }

  /**
   * Runs `fn` on the leader and every replica. Resolves with the successful
   * results if at least one succeeded, otherwise rejects with the first error.
   */
  async executeAll<T>(
    key: string,
    fn: (client: C, node: NodeAddress) => Promise<T>,
  ): Promise<T[]> {
    const routes = this.routeAll(key);
    const settled = await Promise.allSettled(
      routes.map(({ node, client }) => fn(client, node)),
    );

    const results: T[] = [];
    let firstError: unknown;
    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i];
      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
      } else {
        firstError ??= outcome.reason;
        await this.handleFailure(outcome.reason, routes[i].node);
      }
    }
    if (results.length === 0) throw firstError;
    return results;
  }

  async close() {
    this.monitor?.stop();
    this.reconnector.cancelAll();
    await Promise.allSettled(
      this.registry.all().map((e) => this.closeClient(e)),
    );
    for (const id of this.ring.ids()) this.ring.remove(id);
    this.registry.clear();
  }

  private async join(node: NodeConfig) {
    const client = await this.options.connect(node);
    this.registry.set(node, client);
    this.ring.add(nodeId(node), node.vnodes ?? this.vnodes);
    this.monitor?.start();
  }

  private async leave(node: NodeAddress) {
    const id = nodeId(node);
    this.ring.remove(id);
    const entry = this.registry.delete(id);
    if (entry) await this.closeClient(entry);
  }

  private async closeClient({ client, node }: Route<C>) {
    try {
      await this.options.disconnect?.(client, node);
    } catch {
      // the client is being discarded; a failed close changes nothing
    }
  }

  private async markDownIfCurrent(node: NodeAddress, client: C) {
    if (this.registry.get(nodeId(node))?.client === client) {
      await this.markDown(node);
    }
  }

  private async handleFailure(error: unknown, node: NodeAddress) {
    const mark = this.options.shouldMarkDown?.(error, node) ?? true;
    if (mark) await this.markDown(node);
  }
}
