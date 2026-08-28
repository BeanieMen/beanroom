import { reply } from "./output.js";

import type { UserSession } from "../types/session.js";

export default async function command(session: UserSession, _args: string[]): Promise<void> {
  await Promise.resolve();
  const names = session.chatRoom.listChannels();
  const current = session.currentChannel?.name ?? "(none)";
  if (names.length === 0) {
    reply(session, "No channels exist yet.");
    return;
  }
  reply(session, `Channels: ${names.join(", ")} (current: ${current})`);
}
