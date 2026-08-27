import { Server, type ServerChannel, type Connection } from "ssh2";
import { RichWrite, RichWriteLine, type ColorSupportLevel } from "./helper";
import { colors } from "./config";

export interface UserSession {
  id: string;
  name: string;
  client: Connection;
  shell: ServerChannel;
  colorLevel: ColorSupportLevel;
  joinedAt: Date;
}

export class ChatRoom {
  private server: Server;
  private users: Map<string, UserSession> = new Map();

  constructor(server: Server) {
    this.server = server;
  }

  /**
   * Registers a connected client/session and broadcasts their arrival.
   */
  public join(session: UserSession): void {
    this.users.set(session.id, session);
    this.users.forEach((user) => {
      if (user.id !== session.id) {
        RichWriteLine(user.shell, `${session.name} has joined the chat.`, {
          colorLevel: user.colorLevel,
          color: colors.log,
        });
      }
    });
  }
  public leave(userId: string): void {
    const session = this.users.get(userId);
    if (!session) return;
    this.users.delete(userId);
    this.users.forEach((user) => {
      RichWriteLine(user.shell, `${session.name} has left the chat.`, {
        colorLevel: user.colorLevel,
        color: colors.log,
      });
    });
  }

  public broadcast(message: string, senderId?: string): void {
    const sender = senderId ? this.users.get(senderId) : undefined;

    for (const [id, session] of this.users.entries()) {
      if (id === senderId) continue; // Skip sender

      // Clear current input prompt line on receiver's terminal
      session.shell.write("\r\x1b[K");

      if (sender) {
        RichWrite(session.shell, `<${sender.name}> `, {
          colorLevel: session.colorLevel,
          gradient: ["#00ff87", "#60efff"],
        });
        session.shell.write(`${message}\r\n`);
      } else {
        RichWriteLine(session.shell, message, {
          colorLevel: session.colorLevel,
          color: "\x1b[33m", // Yellow ANSI
        });
      }

      // Re-draw prompt line for receiver
      this.promptUser(session);
    }
  }

  public broadcastSystem(message: string, excludeUserId?: string): void {
    this.broadcast(message, undefined);
  }

  private promptUser(session: UserSession): void {
    RichWrite(session.shell, `${session.name}> `, {
      colorLevel: session.colorLevel,
      gradient: ["#ff007f", "#9d00ff"],
    });
  }
  public getServer(): Server {
    return this.server;
  }
}
