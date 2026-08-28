import help from "./help.js";
import login from "./login.js";
import { reply } from "./output.js";
import register from "./register.js";
import { clearCommand, logoutCommand, whoamiCommand } from "./whoami.js";

import type { UserSession } from "../types/session.js";

export type CommandHandler = (session: UserSession, args: string[]) => void | Promise<void>;

export const commands: Record<string, CommandHandler> = {
  clear: clearCommand,
  help,
  login: login as unknown as CommandHandler,
  logout: logoutCommand,
  register: register as unknown as CommandHandler,
  whoami: whoamiCommand,
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
    reply(session, `Unknown command: /${commandName}. Try /help`);
    return;
  }

  await command(session, args);
}
