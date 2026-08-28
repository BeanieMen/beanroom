import type { UserSession } from "../types/session.js";

export default async function command(session: UserSession, _args: string[]): Promise<void> {
  await Promise.resolve();
  session.renderer.openChannelList(session);
}
