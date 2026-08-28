import { THEME } from "../helpers/config.js";

import { reply } from "./output.js";

import type { UserSession } from "../types/session.js";

export default async function command(session: UserSession, _args: string[]): Promise<void> {
  await Promise.resolve();
  const lines: string[] = [
    "Available commands:",
    "  /register <username> <password> - create an account",
    "  /login <username> <password>    - log in",
    "  /logout                         - log out",
    "  /whoami                         - show session info",
    "  /clear                          - clear the screen",
    "  /help                           - show this help",
    "",
    "Tip: type messages directly to chat. Commands start with /.",
  ];

  const title = "━━━ beanroom help ━━━";
  session.renderer.writeLine(session, title, { gradient: THEME.bannerGradient });
  for (const line of lines) reply(session, line);
}
