import { HashRing } from "../src/ring";

const keys = Array.from({ length: 2000 }, (_, i) => `key:${i}`);

describe("HashRing", () => {
  test("empty ring routes nowhere", () => {
    const ring = new HashRing();
    expect(ring.getNode("a")).toBeUndefined();
    expect(ring.getNodes("a", 3)).toEqual([]);
  });

  test("routing is deterministic", () => {
    const ring = new HashRing();
    ring.add("a:1");
    ring.add("b:1");
    expect(ring.getNode("x")).toBe(ring.getNode("x"));
  });

  test("a key hashing above the largest point wraps to the first node", () => {
    const ring = new HashRing((s) => (s.startsWith("a") ? 10 : 20));
    ring.add("a:1", 1);
    expect(ring.getNode("zzz")).toBe("a:1"); // key hashes to 20 > 10
  });

  test("getNodes returns distinct nodes, leader first, capped at ring size", () => {
    const ring = new HashRing();
    ring.add("a:1");
    ring.add("b:1");
    const nodes = ring.getNodes("k", 5);
    expect(nodes).toHaveLength(2);
    expect(new Set(nodes).size).toBe(2);
    expect(nodes[0]).toBe(ring.getNode("k"));
  });

  test("getNodes terminates with a single node", () => {
    const ring = new HashRing();
    ring.add("a:1");
    expect(ring.getNodes("k", 3)).toEqual(["a:1"]);
  });

  test("adding a node only moves keys to the new node", () => {
    const ring = new HashRing();
    ["a:1", "b:1", "c:1"].forEach((n) => ring.add(n));
    const before = keys.map((k) => ring.getNode(k));
    ring.add("d:1");
    keys.forEach((k, i) => {
      const now = ring.getNode(k);
      if (now !== before[i]) expect(now).toBe("d:1");
    });
  });

  test("removing a node only remaps that node's keys", () => {
    const ring = new HashRing();
    ["a:1", "b:1", "c:1"].forEach((n) => ring.add(n));
    const before = keys.map((k) => ring.getNode(k));
    ring.remove("b:1");
    keys.forEach((k, i) => {
      if (before[i] !== "b:1") expect(ring.getNode(k)).toBe(before[i]);
      else expect(ring.getNode(k)).not.toBe("b:1");
    });
  });

  test("keys spread reasonably across nodes", () => {
    const ring = new HashRing();
    ["a:1", "b:1", "c:1", "d:1"].forEach((n) => ring.add(n));
    const counts = new Map<string, number>();
    keys.forEach((k) => {
      const n = ring.getNode(k)!;
      counts.set(n, (counts.get(n) ?? 0) + 1);
    });
    for (const c of counts.values())
      expect(c).toBeGreaterThan(keys.length / 4 / 2);
  });

  test("colliding vnode points are re-salted, not evicted", () => {
    const ring = new HashRing((s) =>
      s.includes("#") ? s.length * 1000 + 7 : 5,
    );
    ring.add("a:1", 1);
    ring.add("b:1", 1);
    expect(new Set(ring.getNodes("k", 2))).toEqual(new Set(["a:1", "b:1"]));
  });

  test("a node with more vnodes owns proportionally more keys", () => {
    const ring = new HashRing();
    ring.add("small:1", 50);
    ring.add("big:1", 200);
    const big = keys.filter((k) => ring.getNode(k) === "big:1").length;
    expect(big / keys.length).toBeGreaterThan(0.65); // ideal: 0.8
    expect(big / keys.length).toBeLessThan(0.95);
  });

  test("rejects a non-positive or fractional vnode count", () => {
    const ring = new HashRing();
    expect(() => ring.add("a:1", 0)).toThrow(RangeError);
    expect(() => ring.add("a:1", 1.5)).toThrow(RangeError);
  });
});
