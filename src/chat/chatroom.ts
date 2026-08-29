import { logger } from "../helpers/logger.js";

import { ChatRoomChannel } from "./channel.js";
import { HistoryService } from "./history.js";

import type { PopupModal, UserSession } from "../types/session.js";

export class ChatRoom {
  private readonly sessions = new Map<string, UserSession>();
  private readonly channels = new Map<string, ChatRoomChannel>();

  constructor() {
    const defaultChannel = new ChatRoomChannel(
      "general",
      "The main Beanroom chat. Pull up a chair.",
      new HistoryService("general.txt"),
    );
    this.channels.set("general", defaultChannel);
    logger.info(`[chatroom] initialized; default channel "general" created`);
  }

  count(): number {
    return this.sessions.size;
  }

  all(): UserSession[] {
    return [...this.sessions.values()];
  }
  createChannel(name: string, description?: string): ChatRoomChannel {
    if (this.channels.has(name)) {
      logger.warn(`[chatroom] createChannel failed: "${name}" already exists`);
      throw new Error(`Channel "${name}" already exists.`);
    }
    const history = new HistoryService(`${name}.txt`);

    const trimmedDescription = description?.trim();
    const channel = new ChatRoomChannel(
      name,
      trimmedDescription && trimmedDescription.length > 0
        ? trimmedDescription
        : `A room for #${name}.`,
      history,
    );

    this.channels.set(name, channel);
    logger.info(`[chatroom] created channel "${name}" (total=${this.channels.size})`);
    return channel;
  }

  deleteChannel(name: string): void {
    if (!this.channels.has(name)) {
      logger.warn(`[chatroom] deleteChannel failed: "${name}" does not exist`);
      throw new Error(`Channel "${name}" does not exist.`);
    }
    this.channels.delete(name);
    logger.info(`[chatroom] deleted channel "${name}" (total=${this.channels.size})`);
  }

  getChannel(name: string): ChatRoomChannel | undefined {
    const channel = this.channels.get(name);
    logger.debug(
      `[chatroom] getChannel("${name}") -> ${channel === undefined ? "NOT FOUND" : `found (members=${channel.count()})`}`,
    );
    return channel;
  }

  listChannels(): string[] {
    const names = [...this.channels.keys()];
    logger.debug(`[chatroom] listChannels -> ${names.join(", ") || "(none)"}`);
    return names;
  }

  listChannelDetails(): ChatRoomChannel[] {
    return [...this.channels.values()].sort((left, right) => {
      if (left.name === "general") return -1;
      if (right.name === "general") return 1;
      return left.name.localeCompare(right.name);
    });
  }

  /** Send a popup modal to a specific user session or broadcast to all active sessions in the chatroom */
  broadcastPopup(popup: PopupModal, targetSessionId?: string): void {
    const targetChannels = [...this.channels.values()];
    const sessionsSeen = new Set<string>();
    for (const channel of targetChannels) {
      for (const session of channel.all()) {
        if (sessionsSeen.has(session.id)) continue;
        sessionsSeen.add(session.id);
        if (targetSessionId === undefined || session.id === targetSessionId) {
          session.renderer.showPopup(session, popup);
        }
      }
    }
  }

  /** Flush pending history writes for every channel. Used on shutdown. */
  async flushAll(): Promise<void> {
    await Promise.all([...this.channels.values()].map((channel) => channel.flush()));
  }
}
