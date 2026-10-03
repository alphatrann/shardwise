import { nodeId } from "./node-id";
import { NodeConfig, Route } from "./types";

/** Tracks the live client for each node address. */
export class NodeRegistry<C> {
  private entries = new Map<string, Route<C>>();

  set(node: NodeConfig, client: C) {
    this.entries.set(nodeId(node), { node, client });
  }

  get(id: string): Route<C> | undefined {
    return this.entries.get(id);
  }

  has(id: string) {
    return this.entries.has(id);
  }

  delete(id: string): Route<C> | undefined {
    const entry = this.entries.get(id);
    this.entries.delete(id);
    return entry;
  }

  all(): Route<C>[] {
    return [...this.entries.values()];
  }

  clear() {
    this.entries.clear();
  }
}
