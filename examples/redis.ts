// Shard keys across several Redis instances with ioredis.
// Start some first, e.g.: for p in 6379 6380 6381; do redis-server --port $p & done
import Redis from "ioredis";
import { Router } from "shardwise";

const router = new Router<Redis>({
  replicas: 2,
  connect: async ({ host, port }) => {
    const client = new Redis({
      host,
      port,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    await client.connect();
    return client;
  },
  disconnect: (client) => client.disconnect(),
  // Probe every node; two failed PINGs in a row take it out of the ring.
  health: {
    checker: { check: async (redis) => (await redis.ping()) === "PONG" },
  },
});

async function main() {
  // The third instance is twice as big, so it gets twice the ring points.
  await router.addNode({ host: "127.0.0.1", port: 6379, vnodes: 100 });
  await router.addNode({ host: "127.0.0.1", port: 6380, vnodes: 100 });
  await router.addNode({ host: "127.0.0.1", port: 6381, vnodes: 200 });

  // Writes go to the leader and its replica; the call fails only if every copy fails.
  await router.executeAll("user:42", (redis) =>
    redis.set("user:42", "ada", "EX", 60),
  );

  // Reads try the leader, then fail over to a replica (marking dead nodes down).
  console.log(await router.execute("user:42", (redis) => redis.get("user:42")));

  await router.close();
}

main();
