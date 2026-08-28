import { logger } from "../helpers/logger.js";

import { ChatRoomChannel } from "./channel.js";
import { HistoryService } from "./history.js";

import type { UserSession } from "../types/session.js";

export class ChatRoom {
  private readonly sessions = new Map<string, UserSession>();
  private readonly channels = new Map<string, ChatRoomChannel>();

  constructor() {
    const defaultChannel = new ChatRoomChannel("general", new HistoryService("general.txt"));
    this.channels.set("general", defaultChannel);
    logger.info(`[chatroom] initialized; default channel "general" created`);
  }

  count(): number {
    return this.sessions.size;
  }

  all(): UserSession[] {
    return [...this.sessions.values()];
  }
  createChannel(name: string): ChatRoomChannel {
    if (this.channels.has(name)) {
      logger.warn(`[chatroom] createChannel failed: "${name}" already exists`);
      throw new Error(`Channel "${name}" already exists.`);
    }
    const history = new HistoryService(`${name}.txt`);

    const channel = new ChatRoomChannel(name, history);

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
}
