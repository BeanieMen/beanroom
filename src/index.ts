import { readFileSync } from "fs";
import { Server, type ClientInfo, type Connection, type ServerChannel } from "ssh2";
import { ChatRoom } from "./chatroom";
import {
  getTerminalColorSupport,
  RichWriteLine,
  type ColorSupportLevel,
} from "./helper";
import { getCombinedUsername } from "./helpers.ts/name";

const serverKey = readFileSync("ssh_host_ed25519_key");

const sshServer = new Server(
  {
    hostKeys: [serverKey],
  },
  (client: Connection, info: ClientInfo) => {
    console.log(`Client connected: ${info.ip}`);
    let clientMachineName = "Guest";

    client.on("authentication", (ctx) => {
      console.log(`Authentication attempt: ${ctx.method}`);

      switch (ctx.method) {
        case "none":
          ctx.reject(["publickey"]);
          break;

        case "publickey":
          console.log(`Public key authentication for user: ${ctx.username}`);
          clientMachineName = getCombinedUsername(ctx.username, ctx.key.data);
          console.log(`Identified machine: ${clientMachineName}`);
          ctx.accept();
          break;

        default:
          console.log(`Unsupported authentication method: ${ctx.method}`);
          ctx.reject();
      }
    });

    client.on("ready", () => {
      console.log("Client authenticated!");

      client.on("session", (accept) => {
        const session = accept();
        let colorSupport: ColorSupportLevel = 1;

        session.on("pty", (accept, _, info) => {
          const ptyInfo = info as typeof info & { term: string };
          colorSupport = getTerminalColorSupport(ptyInfo.term);
          console.log(
            `PTY requested with term: ${ptyInfo.term}, color support level: ${colorSupport}`,
          );
          if (accept) accept();
        });

        session.on("shell", (accept) => {
          const shell: ServerChannel = accept();
          console.log("Shell requested");

          // Render styled border
          RichWriteLine(
            shell,
            "╔══════════════════╗\r\n║     BEANROOM     ║\r\n╚══════════════════╝",
            {
              colorLevel: colorSupport,
              gradient: ["#ff007f", "#9d00ff", "#00f0ff"],
            },
          );

          const userId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

          // Add user to the ChatRoom instance
          chatRoom.join({
            id: userId,
            name: clientMachineName,
            client,
            shell,
            colorLevel: colorSupport,
            joinedAt: new Date(),
          });

          let inputBuffer = "";

          // Handle raw terminal character input
          shell.on("data", (data: Buffer) => {
            const str = data.toString("utf-8");

            for (let i = 0; i < str.length; i++) {
              const char = str[i];
              if (char === undefined) continue; // Guard against undefined under strict null checks

              // Enter key (\r or \n)
              if (char === "\r" || char === "\n") {
                shell.write("\r\n");
                
                // Broadcast non-empty input
                if (inputBuffer.trim().length > 0) {
                  chatRoom.broadcast(inputBuffer.trim(), userId);
                }
                
                inputBuffer = "";
                shell.write(`${clientMachineName} > `);
              }
              // Backspace key (\x7f or \x08)
              else if (char === "\x7f" || char === "\x08") {
                if (inputBuffer.length > 0) {
                  inputBuffer = inputBuffer.slice(0, -1);
                  shell.write("\b \b");
                }
              }
              // Printable characters
              else if (char >= " ") {
                inputBuffer += char;
                shell.write(char); // Local terminal echo
              }
            }
          });

          // Handle client disconnect
          shell.on("close", () => {
            console.log("Shell closed");
            chatRoom.leave(userId);
          });
        });
      });
    });
  },
);

// Instantiate ChatRoom with the SSH Server
const chatRoom = new ChatRoom(sshServer);

sshServer.listen(2222, "127.0.0.1", () => {
  console.log("SSH Server listening on port 2222...");
});