import { AVLTree } from "./avl";
import { defaultHash, HashFn } from "./hash";

/**
 * Pure consistent-hash ring over opaque node ids. Knows nothing about
 * sockets or clients; each node owns `vnodes` points on the ring.
 */
export class HashRing {
  private tree = new AVLTree<string>();
  private points = new Map<string, number[]>();
  private pointCount = 0;

  constructor(private hash: HashFn = defaultHash) {}

  get size() {
    return this.points.size;
  }

  has(id: string) {
    return this.points.has(id);
  }

  ids() {
    return [...this.points.keys()];
  }

  add(id: string, vnodes = 100) {
    if (!Number.isInteger(vnodes) || vnodes < 1) {
      throw new RangeError(`vnodes must be a positive integer, got ${vnodes}`);
    }
    if (this.has(id)) return;
    const owned: number[] = [];

    for (let i = 0; i < vnodes; i++) {
      let salt = 0;
      let point = this.hash(`${id}-${i}`);
      // On a collision with another node's point, re-salt rather than evict it.
      while (this.tree.get(point)) {
        point = this.hash(`${id}-${i}#${++salt}`);
      }
      this.tree.set(point, id);
      owned.push(point);
    }

    this.points.set(id, owned);
    this.pointCount += owned.length;
  }

  remove(id: string) {
    const owned = this.points.get(id);
    if (!owned) return;
    for (const point of owned) this.tree.delete(point);
    this.pointCount -= owned.length;
    this.points.delete(id);
  }

  /** The node responsible for `key`, or undefined if the ring is empty. */
  getNode(key: string): string | undefined {
    return this.getNodes(key, 1)[0];
  }

  /**
   * Up to `count` distinct nodes for `key`, leader first, walking clockwise.
   * Returns fewer if the ring has fewer nodes.
   */
  getNodes(key: string, count: number): string[] {
    const found: string[] = [];
    if (this.pointCount === 0 || count <= 0) return found;

    const seen = new Set<string>();
    const limit = Math.min(count, this.size);
    let current =
      this.tree.getNearestLargerNode(this.hash(key)) ?? this.tree.getMinNode();

    for (let steps = 0; current && steps < this.pointCount; steps++) {
      if (!seen.has(current.value)) {
        seen.add(current.value);
        found.push(current.value);
        if (found.length === limit) break;
      }
      current = this.tree.getSuccessor(current) ?? this.tree.getMinNode();
    }
    return found;
  }
}
