import { readFileSync } from "fs";
import { Server, type ClientInfo, type Connection } from "ssh2";

const serverKey = readFileSync("ssh_host_ed25519_key");

const sshServer = new Server(
  {
    hostKeys: [serverKey],
  },
  (client: Connection, info: ClientInfo) => {
    console.log(`Client connected: ${info.ip}`);

    client.on("authentication", (ctx) => {
      console.log(`Authentication attempt: ${ctx.method}`);

      switch (ctx.method) {
        case "none":
          // Tell the client which authentication methods are available.
          ctx.reject(["publickey"]);
          break;

        case "publickey":
          console.log(`Public key authentication for user: ${ctx.username}`);

          // Accept the key.
          ctx.accept();
          break;

        default:
          console.log(`Unsupported authentication method: ${ctx.method}`);
          ctx.reject();
      }
    });

    client.on("ready", () => {
      console.log("Client authenticated!");
      client.on("session", (accept, reject) => {
        const session = accept();

        session.on("pty", (accept, reject) => {
            console.log("PTY requested - rejecting");
            reject();
        })
        session.on("shell", (accept, reject) => {
          const shell = accept();
          console.log("Shell requested");

          shell.write("Welcome to the SSH server!\n");
          shell.write(`Current user: ${info.ip}\n`);

          shell.on("data", (data: Buffer) => {
            console.log(`Received data from client: ${data.toString()}`);
          });
          shell.on("close", () => {
            console.log("Shell closed");
          });
        });
      });
    });
  },
);

sshServer.listen(2222, "127.0.0.1", () => {
  console.log("SSH Server listening on port 2222...");
});
