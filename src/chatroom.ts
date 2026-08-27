import { Server, type ServerChannel, type Connection } from "ssh2";
import { getUsernameColor, RichWrite, RichWriteLine, type ColorSupportLevel } from "./helper";
import { colors } from "./config";
import { writeFile, existsSync, readFileSync } from "fs";

export interface UserSession {
  id: string;
  name: string;
  client: Connection;
  shell: ServerChannel;
  colorLevel: ColorSupportLevel;
  joinedAt: Date;
  usernameGradient: [string, string]; // Gradient colors for the username
}


export interface LogEntry {
  sender: string;
  message: string;
  timestamp: string;
}

export class ChatRoom {
  private server: Server;
  private users: Map<string, UserSession > = new Map();
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

    writeFile(this.logFile, JSON.stringify(entry) + "\n", { flag: "a" }, (err) => {
      if (err) console.error("Error writing to chatlog.txt", err);
    });
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

        if (entry.sender === "system") {
          RichWriteLine(session.shell, entry.message, {
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
    this.users.set(session.id, { ...session, usernameGradient: getUsernameColor(session.name) });

    this.replayHistory(session, 10);

    const joinMsg = `* ${session.name} has joined the chat.`;
    this.logEvent("system", joinMsg);

    this.users.forEach((user) => {
      if (user.id !== session.id) {
        user.shell.write("\r\x1b[K"); // Clear existing prompt line
        RichWriteLine(user.shell, joinMsg, {
          colorLevel: user.colorLevel,
          color: colors.log,
        });
        this.promptUser(user);
      }
    });

    // 4. Render gradient prompt for the joining user
    this.promptUser(session);
  }

  /**
   * Removes a user and announces departure.
   */
  public leave(userId: string): void {
    const session = this.users.get(userId);
    if (!session) return;

    this.users.delete(userId);
    const leaveMsg = `* ${session.name} has left the chat.`;
    this.logEvent("system", leaveMsg);
		

    this.users.forEach((user) => {
      user.shell.write("\r\x1b[K");
      RichWriteLine(user.shell, leaveMsg, {
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
      this.logEvent(sender.name, message);
    }

    for (const [id, session] of this.users.entries()) {
      if (id === senderId) continue; // Skip sender

      // Clear current input prompt line on receiver's terminal
      session.shell.write("\r\x1b[K");

      if (sender) {
        RichWrite(session.shell, `<${sender.name}> `, {
          colorLevel: session.colorLevel,
          gradient: session.usernameGradient,
        });
        session.shell.write(`${message}\r\n`);
      } else {
        RichWriteLine(session.shell, message, {
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
    RichWrite(session.shell, `${session.name} > `, {
      colorLevel: session.colorLevel,
      gradient: session.usernameGradient,
    });
  }

  public getServer(): Server {
    return this.server;
  }
}