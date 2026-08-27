import { Server, type ServerChannel, type Connection } from "ssh2";
import { getUsernameColor, RichWrite, RichWriteLine, type ColorSupportLevel } from "./helper";
import { colors } from "./config";
import { existsSync, readFileSync, writeFileSync } from "fs";
import type { User } from "./user";

export interface UserSession {
  id: string;
  client: Connection;
  shell: ServerChannel;
  colorLevel: ColorSupportLevel;
  joinedAt: Date;
  usernameGradient: [string, string]; // Gradient colors for the username
  user: User;
}

export interface LogEntry {
  sender: string;
  message: string;
  timestamp: string;
}

/**
 * Returns a formatted time string like "[14:05]"
 */
function getTimestamp(date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `[${hours}:${minutes}]`;
}

export class ChatRoom {
  private server: Server;
  private users: Map<string, UserSession> = new Map();
  private logFile = "chatlog.txt";

  constructor(server: Server) {
    this.server = server;
  }

  /**
   * Helper to write JSON structured logs to file.
   */
  private logEvent(sender: string, message: string): void {
    const entry: LogEntry = {
      sender,
      message,
      timestamp: new Date().toISOString(),
    };

    writeFileSync(this.logFile, JSON.stringify(entry) + "\n", { flag: "a" });
  }

  /**
   * Reads and replays the last N lines from chatlog.txt to a newly joined user.
   */
  public replayHistory(session: UserSession, limit = 10): void {
    if (!existsSync(this.logFile)) return;

    try {
      const fileContent = readFileSync(this.logFile, "utf-8").trim();
      if (!fileContent) return;

      const lines = fileContent.split("\n").slice(-limit);
      for (const line of lines) {
        if (!line) continue;
        const entry: LogEntry = JSON.parse(line);
        const timeStr = getTimestamp(new Date(entry.timestamp));

        if (entry.sender === "system") {
          RichWriteLine(session.shell, `\x1b[90m${timeStr}\x1b[30m${entry.message}`, {
            colorLevel: session.colorLevel,
            color: colors.log,
          });
        } else {
          RichWrite(session.shell, `${entry.sender} `, {
            colorLevel: session.colorLevel,
            gradient: getUsernameColor(entry.sender),
          });
          session.shell.write(`${entry.message}\r\n`);
        }
      }
    } catch (err) {
      console.error("Error reading chat history:", err);
    }
  }

  /**
   * Registers a connected client/session, replays history, and broadcasts arrival.
   */
  public join(session: UserSession): void {
    const sessionData: UserSession = {
      ...session,
      usernameGradient: getUsernameColor(session.user.name),
    };
    this.users.set(session.id, sessionData);

    this.replayHistory(sessionData, 10);

    const joinMsg = `${session.user.name} has joined the chat.`;
    this.logEvent("system", joinMsg);

    const timeStr = getTimestamp();

    this.users.forEach((user) => {
      if (user.id !== session.id) {
        user.shell.write("\r\x1b[K"); // Clear existing prompt line
        RichWriteLine(user.shell, `\x1b[90m${timeStr}\x1b[0m ${joinMsg}`, {
          colorLevel: user.colorLevel,
          color: colors.log,
        });
        this.promptUser(user);
      }
    });

    // Render gradient prompt for the joining user
    this.promptUser(sessionData);
  }

  /**
   * Removes a user and announces departure.
   */
  public leave(userId: string): void {
    const session = this.users.get(userId);
    if (!session) return;

    this.users.delete(userId);
    const leaveMsg = `${session.user.name} has left the chat.`;
    this.logEvent("system", leaveMsg);

    const timeStr = getTimestamp();

    this.users.forEach((user) => {
      user.shell.write("\r\x1b[K");
      RichWriteLine(user.shell, `\x1b[90m${timeStr}\x1b[0m ${leaveMsg}`, {
        colorLevel: user.colorLevel,
        color: colors.log,
      });
      this.promptUser(user);
    });
  }

  /**
   * Broadcasts user messages to all clients (skipping sender).
   */
  public broadcast(message: string, senderId?: string): void {
    const sender = senderId ? this.users.get(senderId) : undefined;

    // Save message to log file
    if (sender) {
      this.logEvent(sender.user.name, message);
    }

    const timeStr = getTimestamp();

    for (const [id, session] of this.users.entries()) {
      if (id === senderId) continue; // Skip sender

      // Clear current input prompt line on receiver's terminal
      session.shell.write("\r\x1b[K");

      if (sender) {
        session.shell.write(`\x1b[90m${timeStr}\x1b[0m `);
        RichWrite(session.shell, `${sender.user.name} `, {
          colorLevel: session.colorLevel,
          gradient: sender.usernameGradient,
        });
        session.shell.write(`${message}\r\n`);
      } else {
        RichWriteLine(session.shell, `\x1b[90m${timeStr}\x1b[0m ${message}`, {
          colorLevel: session.colorLevel,
          color: "\x1b[33m",
        });
      }

      // Re-draw prompt line for receiver
      this.promptUser(session);
    }
  }

  public broadcastSystem(message: string, excludeUserId?: string): void {
    this.broadcast(message, undefined);
  }

  /**
   * Continuous gradient prompt renderer.
   */
  public promptUser(session: UserSession): void {
    RichWrite(session.shell, `${session.user.name} > `, {
      colorLevel: session.colorLevel,
      gradient: session.usernameGradient,
    });
  }

  public getServer(): Server {
    return this.server;
  }
}