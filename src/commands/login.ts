import type { ChatRoom, UserSession } from "../chatroom";
import { RichWriteLine } from "../helper";
import { readFileSync, writeFileSync } from "fs";

export default function command(session: UserSession, args: string[]): void {
  if (args.length != 2) {
    RichWriteLine(session.shell, "Usage: /login <username> <password>", {
      colorLevel: session.colorLevel,
    });
    return;
  }
  const [username, password] = args;
  const passwords = readFileSync("users.txt", "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line)) as {
    username: string;
    password: string;
  }[];
  const userExists = passwords.some((user) => {
    return user.username === username && user.password === password;
  });

  if (!userExists) {
    RichWriteLine(
      session.shell,
      `User ${username} not found or incorrect password.`,
      {
        colorLevel: session.colorLevel,
      },
    );
    return;
  }
  RichWriteLine(session.shell, `User ${username} logged in successfully!`, {
    colorLevel: session.colorLevel,
  });
  session.user.login(username!);
}
