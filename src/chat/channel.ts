import { APP_CONFIG, UI_THEMES } from "../helpers/config.js";
import { logger } from "../helpers/logger.js";
import { formatTimestamp, getUsernameColor } from "../helpers/terminal.js";

import type { HistoryService } from "./history.js";
import type { UserSession } from "../types/session.js";

export class ChatRoomChannel {
  private readonly sesssions = new Map<string, UserSession>();
  private readonly typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    public readonly name: string,
    public readonly description: string,
    private readonly history: HistoryService,
  ) {}

  join(user: UserSession): void {
    this.sesssions.set(user.id, user);
    user.currentChannel = this;
    this.refreshFrames();
    logger.info(
      `[channel:${this.name}] join session=${user.id} user=${user.user.name} (members=${this.sesssions.size})`,
    );

    user.renderer.redraw(user);
    this.announce(`${user.user.name} has joined ${this.name}.`, user.id);
    logger.debug(`[channel:${this.name}] join finished for ${user.user.name}`);
    user.renderer.renderPrompt(user);
  }

  leave(sessionId: string): void {
    const user = this.sesssions.get(sessionId);
    if (!user) {
      logger.warn(`[channel:${this.name}] leave called for unknown session=${sessionId}`);
      return;
    }

    this.setTyping(sessionId, false);
    this.sesssions.delete(sessionId);
    user.currentChannel = null;
    this.refreshFrames();
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

    this.setTyping(sessionId, false);
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

  setTyping(sessionId: string, isTyping: boolean): void {
    if (!this.sesssions.has(sessionId)) return;
    const existing = this.typingTimers.get(sessionId);
    if (existing !== undefined) clearTimeout(existing);

    if (!isTyping) {
      if (existing !== undefined) {
        this.typingTimers.delete(sessionId);
        this.refreshTypingIndicators();
      }
      return;
    }

    const timer = setTimeout(() => {
      this.typingTimers.delete(sessionId);
      this.refreshTypingIndicators();
    }, 3_000);
    this.typingTimers.set(sessionId, timer);
    this.refreshTypingIndicators();
  }

  typingIndicatorFor(sessionId: string): string | undefined {
    const names = [...this.typingTimers.keys()]
      .filter((id) => id !== sessionId)
      .map((id) => this.sesssions.get(id)?.user.name)
      .filter((name): name is string => name !== undefined);

    if (names.length === 0) return undefined;
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return `${names.slice(0, 2).join(", ")}, and others are typing…`;
  }

  /** Flush any pending history writes for this channel to disk. */
  async flush(): Promise<void> {
    await this.history.flush();
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
        color: UI_THEMES[recipient.theme].muted,
      });
      recipient.renderer.renderPrompt(recipient);
    }
  }

  replayHistory(user: UserSession, skipPopup = false): void {
    const entries = this.history.recent(APP_CONFIG.historyLimit);
    logger.debug(
      `[channel:${this.name}] replayHistory for ${user.user.name}: ${entries.length} entries`,
    );
    for (const entry of entries) {
      const timestamp = formatTimestamp(new Date(entry.timestamp));

      if (entry.sender === "system") {
        user.renderer.writeLine(
          user,
          `${timestamp} ${entry.message}`,
          { color: UI_THEMES[user.theme].muted },
          skipPopup,
        );
        continue;
      }

      user.renderer.writeUserMessage(
        user,
        entry.sender,
        entry.message,
        getUsernameColor(entry.sender),
        timestamp,
        skipPopup,
      );
    }
  }

  private refreshFrames(): void {
    for (const session of this.sesssions.values()) session.renderer.refreshFrameHeader(session);
  }

  private refreshTypingIndicators(): void {
    for (const session of this.sesssions.values()) session.renderer.renderPrompt(session);
  }
}
