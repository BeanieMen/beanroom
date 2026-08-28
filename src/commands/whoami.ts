import { reply } from "./output.js";

import type { UserSession } from "../types/session.js";

export async function whoamiCommand(session: UserSession, _args: string[]): Promise<void> {
  await Promise.resolve();
  session.renderer.writePartsLine(session, [
    { text: "User: " },
    { text: `${session.user.name}`, style: { gradient: session.usernameGradient } },
  ]);
  session.renderer.writeLine(session, `Joined: ${session.joinedAt.toLocaleDateString()}`);
  session.renderer.writePartsLine(session, [
    { text: "Username color: Style " },
    { text: "Gradient ", style: { gradient: session.usernameGradient } },
    { text: `${session.usernameGradient[0]} `, style: { color: session.usernameGradient[0] } },
    { text: "to ", style: { color: "\x1b[97m" } },
    { text: session.usernameGradient[1], style: { color: session.usernameGradient[1] } },
  ]);
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
