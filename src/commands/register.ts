import type { ChatRoom, UserSession } from "../chatroom";
import { RichWriteLine } from "../helper";
import { writeFileSync } from "fs";

export default function command(
  session: UserSession,
  args: string[],
): void {
  if (args.length < 2) {
    RichWriteLine(session.shell, "Usage: /register <username> <password>", {
      colorLevel: session.colorLevel,
    });
    return;
  }
  const [username, password] = args;
  writeFileSync("users.txt", JSON.stringify({ username, password }) + "\n", {
    flag: "a",
  });
    RichWriteLine(session.shell, `User ${username} registered successfully! Type /login ${username} ${password} to log in.`, {
      colorLevel: session.colorLevel,
    });
}
