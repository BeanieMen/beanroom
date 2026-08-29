import { createHash } from "node:crypto";

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

import { DEFAULT_THEME } from "./config.js";
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
    activeLogger.info(`[server] Client connected: ${info.ip}`);
    let machineName = "Guest";

    client.on("authentication", (context: AuthContext) => {
      try {
        const publicKey = context as AuthContext & {
          username: string;
          key?: { data?: Buffer };
        };
        const identity = publicKey.key?.data ?? Buffer.from(`${publicKey.username}:${info.ip}`);

        machineName = getCombinedUsername(
          publicKey.username,
          createHash("sha256").update(identity).digest(),
        );

        activeLogger.info(
          `[server] auth accept user=${publicKey.username} -> machine=${machineName}`,
        );

        context.accept();
      } catch {
        activeLogger.warn(`[server] auth error for username=${context.username}`);
        context.reject(["publickey"]);
      }
    });

    client.on("ready", () => {
      activeLogger.debug(`[server] client ready (machine=${machineName})`);
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
          activeLogger.debug(`[server] pty term="${terminal}" ${cols}x${rows}`);
          acceptPty();
        });

        sshSession.on("window-change", (acceptChange, _reject, info: WindowChangeInfo) => {
          rows = Math.max(2, info.rows || rows);
          cols = Math.max(1, info.cols || cols);
          activeLogger.debug(`[server] window-change ${cols}x${rows}`);
          if (userSession !== undefined) userSession.renderer.resize(userSession, rows, cols);
          acceptChange();
        });

        sshSession.on("shell", (acceptShell) => {
          const shell = acceptShell() as ServerChannel;
          const renderer = new TerminalRenderer();
          activeLogger.debug(`[server] shell requested for machine=${machineName}`);
          const channel = chatRoom.getChannel("general");
          if (!channel) {
            logger.warn("Default channel 'general' not found.");
            shell.write("Error: Default channel 'general' not found. Closing connection.\n");
            shell.end();
            return;
          }
          const session: UserSession = {
            id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            client,
            shell,
            user: new User(machineName),
            colorLevel: getTerminalColorSupport(terminal),
            usernameGradient: getUsernameColor(machineName),
            theme: DEFAULT_THEME,
            joinedAt: new Date(),
            term: { rows, cols },
            inputBuffer: "",
            channelList: null,
            activePopup: null,
            renderer,
            chatRoom,
            currentChannel: channel,
          };
          renderer.open(session);
          channel.join(session);
          activeLogger.info(`[server] session=${session.id} joined channel="general"`);

          renderer.showPopup(session, {
            title: "#info",
            author: "BeanieMan",
            timeAgo: "you just came here brah....",
            lines: [
              "HEY!!~, You there. Yes you i am talking to you be nice. thats the first rule and just be a good human being",
              "",
              "this is an le anon chatroom or wtv you can do anything. this is being actively developed on. down below is just some useful stuff you should know",
              "",
              "list help about /list",
              "/login",
              "/register",
              "and other stuff",
              "",
              "if you want your stuff to be saved and not have the weird guest:machine@pvkey, do /register it takes like 2 mins",
            ],
            controlsHint: "Enter continue  Esc/q close",
          });

          userSession = session;

          const input = new InputHandler(
            session,
            (message) => {
              if (message.startsWith("/")) {
                activeLogger.debug(`[server] session=${session.id} command: ${message}`);
                void handleCommand(session, message);
              } else {
                activeLogger.debug(`[server] session=${session.id} message: ${message}`);
                channel.post(session.id, message);
              }
            },
            (channelName: string) => {
              session.renderer.closeChannelList(session);
              void handleCommand(session, `/join ${channelName}`);
            },
          );
          shell.on("data", (data: Buffer) => {
            input.handle(data);
          });
          shell.on("close", () => {
            activeLogger.info(`[server] session=${session.id} shell closed`);
            channel.leave(session.id);
            renderer.close(shell);
          });
        });
      });
    });
  });
}
