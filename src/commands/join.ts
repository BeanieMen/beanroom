import { logger } from "../helpers/logger.js";

import { reply } from "./output.js";

import type { UserSession } from "../types/session.js";

export default async function command(session: UserSession, args: string[]): Promise<void> {
  await Promise.resolve();
  const target = (args[0] ?? "").trim();
  if (target.length === 0) {
    reply(session, "Usage: /join <channel>");
    return;
  }

  const current = session.currentChannel;
  if (current !== null && current.name === target) {
    reply(session, `Already in channel "${target}".`);
    return;
  }

  const channel = session.chatRoom.getChannel(target);
  if (channel === undefined) {
     reply(session, `Channel "${target}" does not exist.`);
      return;
  }

  if (current !== null) {
    current.leave(session.id);
  }

  channel.join(session);
  logger.info(
    `[join] session=${session.id} moved ${session.user.name} ${current?.name ?? "(none)"} -> ${target}`,
  );
  reply(session, `Joined channel "${target}".`);
}
