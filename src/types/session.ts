import type { ColorSupportLevel } from "./chat.js";
import type { User } from "./user.js";
import type { TerminalRenderer } from "../helpers/terminal.js";
import type { Connection, ServerChannel } from "ssh2";

export interface UserSession {
  id: string;
  client: Connection;
  shell: ServerChannel;
  user: User;
  colorLevel: ColorSupportLevel;
  usernameGradient: [string, string];
  joinedAt: Date;
  term: { rows: number; cols: number };
  inputBuffer: string;
  renderer: TerminalRenderer;
}
