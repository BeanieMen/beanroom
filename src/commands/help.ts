import { UI_THEMES } from "../helpers/config.js";

import { reply } from "./output.js";

import type { UserSession } from "../types/session.js";

export default async function command(session: UserSession, _args: string[]): Promise<void> {
  await Promise.resolve();
  const lines: string[] = [
    "Available commands:",
    "  /register <username> <password> - create an account",
    "  /login <username> <password>    - log in",
    "  /logout                         - log out",
    "  /join <channel> [description]   - join or create a channel",
    "  /list                           - browse and join channels",
    "  /whoami                         - show session info",
    "  /clear                          - clear the screen",
    "  /theme <tokyo-night|gruvbox>    - change the terminal palette",
    "  /help                           - show this help",
    "",
    "Tip: type messages directly to chat. Commands start with /.",
  ];

  const title = "━━━ beanroom help ━━━";
  session.renderer.writeLine(session, title, { gradient: UI_THEMES[session.theme].bannerGradient });
  for (const line of lines) reply(session, line);
}
