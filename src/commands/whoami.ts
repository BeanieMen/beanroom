import { reply } from "./output.js";

import type { UserSession } from "../types/session.js";

export async function whoamiCommand(session: UserSession, _args: string[]): Promise<void> {
  await Promise.resolve();
  const info = `User: ${session.user.name} | colorLevel: ${String(session.colorLevel)} | joined: ${session.joinedAt.toISOString()} | term: ${String(session.term.rows)}x${String(session.term.cols)} | loggedIn: ${String(session.user.loggedIn)}`;
  reply(session, info);
  session.renderer.writeLine(
    session,
    `Gradient: ${session.usernameGradient[0]} to ${session.usernameGradient[1]}`,
    { gradient: session.usernameGradient },
  );
  session.renderer.renderPrompt(session);
}

export async function clearCommand(session: UserSession, _args: string[]): Promise<void> {
  await Promise.resolve();
  session.renderer.clear(session);
}

export async function logoutCommand(session: UserSession, _args: string[]): Promise<void> {
  await Promise.resolve();
  if (!session.user.loggedIn) {
    reply(session, "Not logged in.");
    return;
  }

  try {
    session.user.logout();
    reply(session, "Logged out successfully.");
  } catch {
    reply(session, "Logout failed.");
  }
}

export default whoamiCommand;
