import { authService } from "../helpers/auth.js";
import { getUsernameColor } from "../helpers/terminal.js";

import type { UserSession } from "../types/session.js";

function reply(session: UserSession, message: string): void {
  session.renderer.writeLine(session, message);
  session.renderer.renderPrompt(session);
}

export async function registerCommand(session: UserSession, args: string[]): Promise<void> {
  const username = args[0]?.trim() ?? "";
  const password = args[1]?.trim() ?? "";

  if (username.length === 0 || password.length === 0) {
    reply(session, "Usage: /register <username> <password>");
    return;
  }

  try {
    const result = await authService.register(username, password);
    if (result.includes("registered successfully")) {
      session.usernameGradient = getUsernameColor(username);
    }
    reply(session, result);
  } catch {
    reply(session, "Registration failed. Please try again.");
  }
}

export async function loginCommand(session: UserSession, args: string[]): Promise<void> {
  const username = args[0]?.trim() ?? "";
  const password = args[1]?.trim() ?? "";

  if (username.length === 0 || password.length === 0) {
    reply(session, "Usage: /login <username> <password>");
    return;
  }

  try {
    const result = await authService.login(username, password);
    if (result.username === undefined) {
      reply(session, result.message);
      return;
    }
    session.user.login(result.username);

    const saved = authService.getColorPreference(result.username);
    session.usernameGradient = saved ?? getUsernameColor(result.username);

    reply(session, result.message);
  } catch {
    reply(session, "Invalid credentials.");
  }
}

export function logoutCommand(session: UserSession): void {
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
