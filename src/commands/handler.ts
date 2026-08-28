import { logger } from "../helpers/logger.js";

import announce from "./announce.js";
import channels from "./channels.js";
import color from "./color.js";
import help from "./help.js";
import join from "./join.js";
import list from "./list.js";
import login from "./login.js";
import { reply } from "./output.js";
import register from "./register.js";
import theme from "./theme.js";
import { clearCommand, logoutCommand, whoamiCommand } from "./whoami.js";

import type { UserSession } from "../types/session.js";

export type CommandHandler = (session: UserSession, args: string[]) => void | Promise<void>;

export const commands: Record<string, CommandHandler> = {
  announce,
  channels,
  clear: clearCommand,
  help,
  join,
  login,
  list,
  logout: logoutCommand,
  register,
  theme,
  whoami: whoamiCommand,
  color,
};

export async function handleCommand(session: UserSession, message: string): Promise<void> {
  const sanitized = message.trim().slice(0, 512);
  const parts = sanitized.split(/\s+/).slice(0, 4);
  const rawName = parts[0] ?? "";
  const commandName = rawName.startsWith("/") ? rawName.slice(1).toLowerCase().trim() : "";
  const args = parts
    .slice(1)
    .map((a) => a.trim())
    .slice(0, 3);

  if (commandName.length === 0) {
    return;
  }

  const command = commands[commandName];
  if (command === undefined) {
    logger.debug(`[handler] unknown command "${commandName}" from session=${session.id}`);
    reply(session, `Unknown command: /${commandName}. Try /help`);
    return;
  }

  logger.debug(
    `[handler] session=${session.id} executing /${commandName} args=${JSON.stringify(args)}`,
  );
  await command(session, args);
  logger.debug(`[handler] session=${session.id} finished /${commandName}`);
}
