import type { UserSession } from "../chatroom";
import login from "./login";
import register from "./register";

export const commands: Record<string, (session: UserSession, args: string[]) => void> =
  {
    login,
    register,
  };

export function handleCommand(session: UserSession, message: string): void {
    const commandName = message.split(" ")[0]?.substring(1); // Remove the leading '/'
    const args = message.split(" ").slice(1); // Get the arguments after the command
    console.log(`Command: ${commandName}, Args: ${args.join(", ")}`);
    if (!commandName || !commands[commandName]) return
    const command = commands[commandName];
    command(session, args);
}