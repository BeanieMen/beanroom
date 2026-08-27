import { readFileSync } from "fs";
import { Server, type ClientInfo, type Connection } from "ssh2";
import { colors } from "./config";
import {
  getTerminalColorSupport,
  RichWriteLine,
  type ColorSupportLevel,
} from "./helper";

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
          ctx.reject(["publickey"]);
          break;

        case "publickey":
          console.log(`Public key authentication for user: ${ctx.username}`);
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
        let colorSupport: ColorSupportLevel = 1;

        session.on("pty", (accept, reject, info) => {
          const ptyInfo = info as typeof info & { term: string };
          colorSupport = getTerminalColorSupport(ptyInfo.term);
          console.log(
            `PTY requested with term: ${ptyInfo.term}, color support level: ${colorSupport}`,
          );
          accept();
        });

        session.on("shell", (accept, reject) => {
          const shell = accept();
          console.log("Shell requested");

          // Render styled border using VS Code compatible hex values
          RichWriteLine(
            shell,
            "╔══════════════════╗\r\n║     BEANROOM     ║\r\n╚══════════════════╝",
            {
              colorLevel: colorSupport,
              gradient: ["#ff007f", "#9d00ff", "#00f0ff"], // Pink -> Purple -> Cyan
            },
          );

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
