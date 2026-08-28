import {
  Server,
  type AuthContext,
  type ClientInfo,
  type Connection,
  type PseudoTtyInfo,
  type ServerChannel,
  type Session,
  type WindowChangeInfo,
} from "ssh2";

import { handleCommand } from "../commands/handler.js";
import { User } from "../types/user.js";

import { logger, type Logger } from "./logger.js";
import { getCombinedUsername } from "./name.js";
import {
  InputHandler,
  getTerminalColorSupport,
  getUsernameColor,
  TerminalRenderer,
} from "./terminal.js";

import type { ChatRoom } from "../chat/chatroom.js";
import type { UserSession } from "../types/session.js";

export function createSshServer(
  hostKeys: Buffer[],
  chatRoom: ChatRoom,
  activeLogger: Logger = logger,
): Server {
  return new Server({ hostKeys }, (client: Connection, info: ClientInfo) => {
    activeLogger.info(`Client connected: ${info.ip}`);
    let machineName = "Guest";

    client.on("authentication", (context: AuthContext) => {
      if (context.method !== "publickey") {
        context.reject(["publickey"]);
        return;
      }
      try {
        const publicKey = context as AuthContext & { username: string; key: { data: Buffer } };
        machineName = getCombinedUsername(publicKey.username, publicKey.key.data);
        context.accept();
      } catch {
        context.reject(["publickey"]);
      }
    });

    client.on("ready", () => {
      client.on("session", (accept) => {
        const sshSession = accept() as Session;
        let terminal = "";
        let rows = 24;
        let cols = 80;
        let userSession: UserSession | undefined;

        sshSession.on("pty", (acceptPty, _reject, info: PseudoTtyInfo) => {
          terminal = (info as PseudoTtyInfo & { term?: string }).term ?? "";
          rows = Math.max(2, info.rows || rows);
          cols = Math.max(1, info.cols || cols);
          acceptPty();
        });

        sshSession.on("window-change", (acceptChange, _reject, info: WindowChangeInfo) => {
          rows = Math.max(2, info.rows || rows);
          cols = Math.max(1, info.cols || cols);
          if (userSession !== undefined) userSession.renderer.resize(userSession, rows, cols);
          acceptChange();
        });

        sshSession.on("shell", (acceptShell) => {
          const shell = acceptShell() as ServerChannel;
          const renderer = new TerminalRenderer();
          const session: UserSession = {
            id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            client,
            shell,
            user: new User(machineName),
            colorLevel: getTerminalColorSupport(terminal),
            usernameGradient: getUsernameColor(machineName),
            joinedAt: new Date(),
            term: { rows, cols },
            inputBuffer: "",
            renderer,
          };
          userSession = session;
          renderer.open(session);
          chatRoom.join(session);

          const input = new InputHandler(session, (message) => {
            if (message.startsWith("/")) void handleCommand(session, message);
            else chatRoom.post(session.id, message);
          });
          shell.on("data", (data: Buffer) => {
            input.handle(data);
          });
          shell.on("close", () => {
            chatRoom.leave(session.id);
            renderer.close(shell);
          });
        });
      });
    });
  });
}
