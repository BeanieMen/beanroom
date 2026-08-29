import { logger } from "../helpers/logger.js";

import { loginCommand, logoutCommand, registerCommand } from "./auth.js";
import { channelsCommand, joinCommand, listCommand } from "./channel.js";
import {
  announceCommand,
  clearCommand,
  colorCommand,
  helpCommand,
  themeCommand,
  whoamiCommand,
} from "./system.ts";

import type { UserSession } from "../types/session.js";

export type CommandHandler = (session: UserSession, args: string[]) => void | Promise<void>;

export const commands: Record<string, CommandHandler> = {
  announce: announceCommand,
  channels: channelsCommand,
  clear: clearCommand,
  color: colorCommand,
  help: helpCommand,
  join: joinCommand,
  list: listCommand,
  login: loginCommand,
  logout: logoutCommand,
  register: registerCommand,
  theme: themeCommand,
  whoami: whoamiCommand,
};

export async function handleCommand(session: UserSession, message: string): Promise<void> {
  const sanitized = message.trim().slice(0, 512);
  const parts = sanitized.split(/\s+/).slice(0, 4);
  const rawName = parts[0] ?? "";
  const commandName = rawName.startsWith("/") ? rawName.slice(1).toLowerCase().trim() : "";
  const args = parts.slice(1).map((a) => a.trim());

  if (commandName.length === 0) {
    return;
  }

  const command = commands[commandName];
  if (command === undefined) {
    logger.debug(`[handler] unknown command "${commandName}" from session=${session.id}`);
    session.renderer.writeLine(session, `Unknown command: /${commandName}. Try /help`);
    session.renderer.renderPrompt(session);
    return;
  }

  logger.debug(
    `[handler] session=${session.id} executing /${commandName} args=${JSON.stringify(args)}`,
  );
  await command(session, args);
  logger.debug(`[handler] session=${session.id} finished /${commandName}`);
}
