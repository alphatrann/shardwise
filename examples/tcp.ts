// Any backend works if you can open a client from host:port. Here the "client"
// is a bare TCP socket speaking a line protocol (this one is Redis inline PING).
import net from "net";
import { Router } from "shardwise";

const router = new Router<net.Socket>({
  connect: ({ host, port }) =>
    new Promise((resolve, reject) => {
      const socket = net.connect({ host, port }, () => resolve(socket));
      socket.once("error", reject);
    }),
  disconnect: (socket) => socket.destroy(),
});

async function main() {
  await router.addNode({ host: "127.0.0.1", port: 6379 });
  const { node, client } = router.route("some-key");
  console.log(`some-key -> ${node.host}:${node.port}`);
  client.write("PING\r\n");
  client.once("data", (d) => {
    console.log(d.toString().trim());
    router.close();
  });
}

main();
