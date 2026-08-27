import { readFileSync } from "fs";
import {
  Server,
  type ClientInfo,
  type Connection,
  type ServerChannel,
} from "ssh2";
import { ChatRoom, type UserSession } from "./chatroom";
import {
  getTerminalColorSupport,
  getUsernameColor,
  RichWrite,
  RichWriteLine,
  type ColorSupportLevel,
} from "./helper";
import { getCombinedUsername } from "./helpers.ts/name";
import { handleCommand } from "./commands/handler";
import { User } from "./user";

const serverKey = readFileSync("ssh_host_ed25519_key");

function setupFullTerminalScreen(shell: ServerChannel, rows: number) {
  shell.write(
    "\x1b[?1049h" + // Enter alternate screen buffer (full screen mode)
      "\x1b[2J" + // Clear entire screen
      `\x1b[1;${rows - 1}r` + // Define scroll region: Row 1 to (rows - 1)
      `\x1b[${rows};1H`, // Position cursor at bottom row
  );
}
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
        let termRows = 24;
        let termCols = 80;
        session.on("pty", (accept, _, info) => {
          const ptyInfo = info as typeof info & { term: string };
          colorSupport = getTerminalColorSupport(ptyInfo.term);
          if (ptyInfo.rows && ptyInfo.cols) {
            termRows = ptyInfo.rows;
            termCols = ptyInfo.cols;
          }
          console.log(
            `PTY requested with term: ${ptyInfo.term}, color support level: ${colorSupport}`,
          );
          if (accept) accept();
        });

        session.on("window-change", (accept, _, info) => {
          if (info) {
            termRows = info.rows;
            termCols = info.cols;
            console.log(
              `Window size changed: ${termRows} rows, ${termCols} cols`,
            );
            setupFullTerminalScreen(session, termRows);
            chatROom.promptUser(userSession
          }
        });
        session.on("shell", (accept) => {
          const shell: ServerChannel = accept();
          console.log("Shell requested");

          // Render styled gradient banner
          RichWriteLine(shell, "╔══════════════════╗", {
            colorLevel: colorSupport,
            gradient: ["#ff007f", "#9d00ff", "#00f0ff"],
          });
          RichWrite(shell, "║", {
            colorLevel: colorSupport,
            gradient: ["#ff007f", "#9d00ff", "#00f0ff"],
          });
          RichWrite(shell, "     BEANROOM     ");
          RichWrite(shell, "║\r\n", {
            colorLevel: colorSupport,
            gradient: ["#00f0ff", "#9d00ff", "#ff007f"],
          });

          RichWriteLine(shell, "╚══════════════════╝\r\n", {
            colorLevel: colorSupport,
            gradient: ["#ff007f", "#9d00ff", "#00f0ff"],
          });
          RichWriteLine(
            shell,
            "🐱🐱 HEY!!~ You there! Welcome to wtv this is idk. chat with other people and be nice\r\nalso do a /register 'username' and 'password' to have your preferences saved",
            { colorLevel: colorSupport, color: "#5b9fff" },
          );

          const userId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

          const userSession: UserSession = {
            id: userId,
            user: new User(clientMachineName),
            client,
            shell,
            colorLevel: colorSupport,
            joinedAt: new Date(),
            usernameGradient: getUsernameColor(clientMachineName),
          };

          // Register user in the chatroom
          chatRoom.join(userSession);

          let inputBuffer = "";

          // Handle raw terminal character input
          shell.on("data", (data: Buffer) => {
            const str = data.toString("utf-8");

            for (let i = 0; i < str.length; i++) {
              const char = str[i];
              if (char === undefined) continue;

              // Enter key (\r or \n)
              if (char === "\r" || char === "\n") {
                shell.write("\r\n");
                const message = inputBuffer.trim();
                if (message.startsWith("/")) {
                  // Handle command
                  handleCommand(userSession, message);
                } else if (message.length > 0) {
                  // Broadcast message to other users
                  chatRoom.broadcast(message, userId);
                }
                inputBuffer = "";

                // Re-render gradient prompt for the sender via chatRoom
                chatRoom.promptUser(userSession);
              }

              // Backspace key (\x7f or \x08)
              else if (char === "\x7f" || char === "\x08") {
                if (inputBuffer.length > 0) {
                  inputBuffer = inputBuffer.slice(0, -1);
                  shell.write("\b \b");
                }
              } else if (char === "\x03") {
                // Ctrl+C
                shell.write("\r\n");
                chatRoom.leave(userId);
                shell.end();
              }
              // Printable characters
              else if (char >= " ") {
                inputBuffer += char;
                shell.write(char); // Echo character to terminal
              }
            }
          });

          // Handle client disconnect
          shell.on("close", () => {
            console.log("Shell closed");
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
