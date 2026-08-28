import { AuthService } from "../helpers/auth.js";

import { reply } from "./output.js";

import type { UserSession } from "../types/session.js";

const authService = new AuthService();

export default async function command(session: UserSession, args: string[]): Promise<void> {
  const sanitizedArgs = args.map((a) => a.trim()).slice(0, 3);

  if (sanitizedArgs.length !== 2) {
    reply(session, "Usage: /login <username> <password>");
    return;
  }

  const username = sanitizedArgs[0] ?? "";
  const password = sanitizedArgs[1] ?? "";

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
    reply(session, result.message);
  } catch {
    reply(session, "Invalid credentials.");
  }
}
