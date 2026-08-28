import { authService } from "../helpers/auth.js";

import { reply } from "./output.js";

import type { UserSession } from "../types/session.js";

const HEX = /^#[0-9A-Fa-f]{6}$/;

export default async function command(session: UserSession, args: string[]): Promise<void> {
  await Promise.resolve();
  const colorType = (args[0] ?? "").toUpperCase();

  let gradient: [string, string] | undefined;

  if (colorType === "SOLID") {
    if (!args[1] || !HEX.test(args[1])) {
      reply(session, "Usage: /color SOLID <hex color>");
      return;
    }
    gradient = [args[1], args[1]];
  } else if (colorType === "GRADIENT") {
    if (!args[1] || !HEX.test(args[1]) || !args[2] || !HEX.test(args[2])) {
      reply(session, "Usage: /color GRADIENT <hex color 1> <hex color 2>");
      return;
    }
    gradient = [args[1], args[2]];
  } else {
    reply(session, "Usage: /color <SOLID|GRADIENT> <colors...>");
    reply(session, "Example: /color SOLID #FF0000");
    reply(session, "Example: /color GRADIENT #FF0000 #00FF00");
    return;
  }

  session.usernameGradient = gradient;

  if (session.user.loggedIn) {
    try {
      await authService.setColorPreference(session.user.name, gradient);
      reply(session, `Color set to ${colorType} ${gradient.join(" -> ")} (saved).`);
      return;
    } catch {
      // Fall through to the non-persisted confirmation.
      reply(session, "Color changed but could not be saved.");
      return;
    }
  }

  session.renderer.renderPrompt(session);
}
