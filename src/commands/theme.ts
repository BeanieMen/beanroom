import { UI_THEMES, type UiThemeName } from "../helpers/config.js";

import { reply } from "./output.js";

import type { UserSession } from "../types/session.js";

const THEME_ALIASES: Record<string, UiThemeName> = {
  TOKYO: "tokyo-night",
  "TOKYO-NIGHT": "tokyo-night",
  GRUVBOX: "gruvbox",
  // Accept the spelling used in the initial UI direction as well.
  GRUBBOX: "gruvbox",
};

export default async function command(session: UserSession, args: string[]): Promise<void> {
  await Promise.resolve();
  const requested = (args[0] ?? "").trim().toUpperCase();
  const theme = THEME_ALIASES[requested];

  if (theme === undefined) {
    reply(session, "Usage: /theme <tokyo-night|gruvbox>");
    return;
  }

  session.theme = theme;
  session.renderer.redraw(session);
  reply(session, `Theme set to ${UI_THEMES[theme].label}.`);
}
