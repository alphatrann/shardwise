import { NoNodesError, Router } from "../src/router";

const addr = (port: number) => ({ host: "h", port });
const fast = { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2 };

function make(overrides = {}) {
  const connect = jest.fn(async (n: { host: string; port: number }) => ({
    id: `${n.host}:${n.port}`,
  }));
  const disconnect = jest.fn();
  const router = new Router({
    connect,
    disconnect,
    retry: fast,
    vnodes: 20,
    ...overrides,
  });
  return { router, connect, disconnect };
}

describe("Router", () => {
  test("routes to a connected client", async () => {
    const { router } = make();
    await router.addNode(addr(1));
    expect(router.route("k").client.id).toBe("h:1");
  });

  test("throws NoNodesError when empty", () => {
    expect(() => make().router.route("k")).toThrow(NoNodesError);
  });

  test("addNode retries connect and succeeds", async () => {
    let calls = 0;
    const { router } = make({
      connect: async () => {
        if (++calls < 3) throw new Error("down");
        return {};
      },
    });
    await router.addNode(addr(1));
    expect(calls).toBe(3);
  });

  test("addNode rejects once retries are exhausted", async () => {
    const { router } = make({
      connect: async () => {
        throw new Error("down");
      },
    });
    await expect(router.addNode(addr(1))).rejects.toThrow("down");
  });

  test("execute fails over to a replica and marks the node down", async () => {
    const { router, disconnect } = make();
    await router.addNode(addr(1));
    await router.addNode(addr(2));
    const leader = router.route("k").node;

    const result = await router.execute("k", async (c: { id: string }) => {
      if (c.id === `h:${leader.port}`) throw new Error("boom");
      return c.id;
    });

    expect(result).not.toBe(`h:${leader.port}`);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(router.route("k").node.port).not.toBe(leader.port);
    await router.close();
  });

  test("markDown reconnects in the background", async () => {
    const { router, connect } = make();
    await router.addNode(addr(1));
    await router.markDown(addr(1));
    expect(() => router.route("k")).toThrow(NoNodesError);
    await new Promise((r) => setTimeout(r, 30));
    expect(connect).toHaveBeenCalledTimes(2);
    expect(router.route("k").node.port).toBe(1);
    await router.close();
  });

  test("executeAll resolves if any replica succeeds", async () => {
    const { router } = make({ replicas: 2 });
    await router.addNode(addr(1));
    await router.addNode(addr(2));
    let first = true;
    const results = await router.executeAll("k", async (c: { id: string }) => {
      if (first) {
        first = false;
        throw new Error("x");
      }
      return c.id;
    });
    expect(results).toHaveLength(1);
    await router.close();
  });

  test("executeAll rejects when every node fails", async () => {
    const { router } = make();
    await router.addNode(addr(1));
    await expect(
      router.executeAll("k", async () => {
        throw new Error("all bad");
      }),
    ).rejects.toThrow("all bad");
    await router.close();
  });

  test("removeNode takes the node out", async () => {
    const { router, disconnect } = make();
    await router.addNode(addr(1));
    await router.removeNode(addr(1));
    expect(disconnect).toHaveBeenCalled();
    expect(() => router.route("k")).toThrow(NoNodesError);
  });

  test("per-node vnodes weight the share of keys", async () => {
    const { router } = make();
    await router.addNode({ ...addr(1), vnodes: 20 });
    await router.addNode({ ...addr(2), vnodes: 180 });
    const keys = Array.from({ length: 1000 }, (_, i) => `k${i}`);
    const on2 = keys.filter((k) => router.route(k).node.port === 2).length;
    expect(on2).toBeGreaterThan(700);
    await router.close();
  });

  test("a reconnected node keeps its vnode weight", async () => {
    const { router } = make();
    await router.addNode({ ...addr(1), vnodes: 7 });
    await router.markDown(addr(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(router.route("k").node.vnodes).toBe(7);
    await router.close();
  });

  describe("health checks", () => {
    const health = (check: jest.Mock, failureThreshold = 2) => ({
      checker: { check },
      intervalMs: 5,
      timeoutMs: 20,
      failureThreshold,
    });
    const slowReconnect = {
      maxRetries: 0,
      baseDelayMs: 10_000,
      maxDelayMs: 10_000,
    };
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    test("removes a node after consecutive failed probes; keys move clockwise", async () => {
      const check = jest.fn(async (c: { id: string }) => c.id !== "h:2");
      const { router } = make({ health: health(check), retry: slowReconnect });
      await router.addNode(addr(1));
      await router.addNode(addr(2));
      const on2 = Array.from({ length: 50 }, (_, i) => `k${i}`).filter(
        (k) => router.route(k).node.port === 2,
      );
      expect(on2.length).toBeGreaterThan(0);

      await wait(25);
      for (const k of on2) expect(router.route(k).node.port).toBe(1);
      await router.close();
    });

    test("one failed probe below the threshold keeps the node", async () => {
      let n = 0;
      const check = jest.fn(async () => ++n !== 1);
      const { router } = make({ health: health(check, 3) });
      await router.addNode(addr(1));
      await wait(30);
      expect(router.route("k").node.port).toBe(1);
      await router.close();
    });

    test("a hung probe counts as a failure", async () => {
      const check = jest.fn(() => new Promise<boolean>(() => {}));
      const { router } = make({
        health: health(check, 1),
        retry: slowReconnect,
      });
      await router.addNode(addr(1));
      await wait(60);
      expect(() => router.route("k")).toThrow(NoNodesError);
      await router.close();
    });

    test("stops probing after close", async () => {
      const check = jest.fn(async () => true);
      const { router } = make({ health: health(check) });
      await router.addNode(addr(1));
      await wait(20);
      await router.close();
      const calls = check.mock.calls.length;
      await wait(30);
      expect(check.mock.calls.length).toBe(calls);
    });
  });
});
