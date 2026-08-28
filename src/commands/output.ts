import type { UserSession } from "../types/session.js";

export function reply(session: UserSession, message: string): void {
  session.renderer.writeLine(session, message);
  session.renderer.renderPrompt(session);
}
