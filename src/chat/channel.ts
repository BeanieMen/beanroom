import { APP_CONFIG, THEME } from "../helpers/config";
import { logger } from "../helpers/logger";
import { formatTimestamp, getUsernameColor } from "../helpers/terminal";

import type { HistoryService } from "./history";
import type { UserSession } from "../types/session";

export class ChatRoomChannel {
  private readonly sesssions = new Map<string, UserSession>();

  constructor(
    public readonly name: string,
    private readonly history: HistoryService,
  ) {}

  join(user: UserSession): void {
    this.sesssions.set(user.id, user);
    user.currentChannel = this;
    this.announce(`${user.user.name} has joined ${this.name}.`, user.id);
    logger.info(
      `[channel:${this.name}] join session=${user.id} user=${user.user.name} (members=${this.sesssions.size})`,
    );

    this.replayHistory(user);
    logger.debug(`[channel:${this.name}] join finished for ${user.user.name}`);
    user.renderer.renderPrompt(user);
  }

  leave(sessionId: string): void {
    const user = this.sesssions.get(sessionId);
    if (!user) {
      logger.warn(`[channel:${this.name}] leave called for unknown session=${sessionId}`);
      return;
    }

    this.sesssions.delete(sessionId);
    user.currentChannel = null;
    logger.info(
      `[channel:${this.name}] leave session=${sessionId} user=${user.user.name} (members=${this.sesssions.size})`,
    );

    this.announce(`${user.user.name} has left ${this.name}.`, sessionId);
  }

  post(sessionId: string, message: string): void {
    const sender = this.sesssions.get(sessionId);
    if (!sender) {
      logger.warn(`[channel:${this.name}] post from non-member session=${sessionId} dropped`);
      return;
    }

    const timestamp = new Date();

    logger.info(
      `[channel:${this.name}] post session=${sessionId} user=${sender.user.name}: "${message}" (members=${this.sesssions.size})`,
    );
    this.history.append({ sender: sender.user.name, message, timestamp: timestamp.toISOString() });

    for (const recipient of this.sesssions.values()) {
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
    return this.sesssions.size;
  }

  all(): UserSession[] {
    return [...this.sesssions.values()];
  }

  has(sessionId: string): boolean {
    return this.sesssions.has(sessionId);
  }

  private announce(message: string, excludedSessionId?: string): void {
    const timestamp = new Date();

    logger.debug(
      `[channel:${this.name}] announce: "${message}" (excluded=${excludedSessionId ?? "none"}, members=${this.sesssions.size})`,
    );
    this.history.append({ sender: "system", message, timestamp: timestamp.toISOString() });
    for (const recipient of this.sesssions.values()) {
      if (recipient.id === excludedSessionId) continue;
      recipient.renderer.writeLine(recipient, `${formatTimestamp(timestamp)} ${message}`, {
        color: THEME.systemColor,
      });
      recipient.renderer.renderPrompt(recipient);
    }
  }

  private replayHistory(user: UserSession): void {
    const entries = this.history.recent(APP_CONFIG.historyLimit);
    logger.debug(
      `[channel:${this.name}] replayHistory for ${user.user.name}: ${entries.length} entries`,
    );
    for (const entry of entries) {
      const timestamp = formatTimestamp(new Date(entry.timestamp));

      if (entry.sender === "system") {
        user.renderer.writeLine(user, `${timestamp} ${entry.message}`, {
          color: THEME.systemColor,
        });
        continue;
      }

      user.renderer.writeUserMessage(
        user,
        entry.sender,
        entry.message,
        getUsernameColor(entry.sender),
        timestamp,
      );
    }
  }
}
