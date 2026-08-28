import { logger } from "../helpers/logger.js";

import { reply } from "./output.js";

import type { UserSession } from "../types/session.js";

export default async function command(session: UserSession, args: string[]): Promise<void> {
  await Promise.resolve();
  const target = (args[0] ?? "").trim();
  if (target.length === 0) {
    reply(session, "Usage: /join <channel> [description]");
    return;
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,23}$/i.test(target)) {
    reply(session, "Channel names use letters, numbers, underscores, and hyphens (max 24). ");
    return;
  }

  const current = session.currentChannel;
  if (current !== null && current.name === target) {
    reply(session, `Already in channel "${target}".`);
    return;
  }

  let channel = session.chatRoom.getChannel(target);
  const description = args.slice(1).join(" ");
  const created = channel === undefined;
  channel ??= session.chatRoom.createChannel(target, description);

  if (current !== null) {
    current.leave(session.id);
  }

  channel.join(session);
  logger.info(
    `[join] session=${session.id} moved ${session.user.name} ${current?.name ?? "(none)"} -> ${target}`,
  );
  reply(session, created ? `Created and joined #${target}.` : `Joined channel "${target}".`);
}
