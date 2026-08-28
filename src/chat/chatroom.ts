import { APP_CONFIG, THEME } from "../helpers/config.js";
import { formatTimestamp, getUsernameColor } from "../helpers/terminal.js";

import type { HistoryService } from "./history.js";
import type { UserSession } from "../types/session.js";

export class ChatRoom {
  private readonly sessions = new Map<string, UserSession>();

  constructor(private readonly history: HistoryService) {}

  join(session: UserSession): void {
    this.sessions.set(session.id, session);
    this.replayHistory(session);
    session.renderer.showWelcome(session);
    this.announce(`${session.user.name} has joined the chat.`, session.id);
    session.renderer.renderPrompt(session);
  }

  leave(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return;
    this.sessions.delete(sessionId);
    this.announce(`${session.user.name} has left the chat.`);
  }

  post(sessionId: string, message: string): void {
    const sender = this.sessions.get(sessionId);
    if (sender === undefined) return;
    const timestamp = new Date();
    this.history.append({ sender: sender.user.name, message, timestamp: timestamp.toISOString() });
    for (const recipient of this.sessions.values()) {
      recipient.renderer.writeUserMessage(
        recipient,
        sender.user.name,
        message,
        sender.usernameGradient,
        formatTimestamp(timestamp),
      );
      recipient.renderer.renderPrompt(recipient);
    }
  }

  count(): number {
    return this.sessions.size;
  }

  all(): UserSession[] {
    return [...this.sessions.values()];
  }

  private announce(message: string, excludedSessionId?: string): void {
    const timestamp = new Date();
    this.history.append({ sender: "system", message, timestamp: timestamp.toISOString() });
    for (const recipient of this.sessions.values()) {
      if (recipient.id === excludedSessionId) continue;
      recipient.renderer.writeLine(recipient, `${formatTimestamp(timestamp)} ${message}`, {
        color: THEME.systemColor,
      });
      recipient.renderer.renderPrompt(recipient);
    }
  }

  private replayHistory(session: UserSession): void {
    for (const entry of this.history.recent(APP_CONFIG.historyLimit)) {
      const timestamp = formatTimestamp(new Date(entry.timestamp));
      if (entry.sender === "system") {
        session.renderer.writeLine(session, `${timestamp} ${entry.message}`, {
          color: THEME.systemColor,
        });
      } else {
        session.renderer.writeUserMessage(
          session,
          entry.sender,
          entry.message,
          getUsernameColor(entry.sender),
          timestamp,
        );
      }
    }
  }
}
