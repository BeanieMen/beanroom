import { authService } from "../helpers/auth.js";
import { UI_THEMES, type UiThemeName } from "../helpers/config.js";

import type { UserSession } from "../types/session.js";

function reply(session: UserSession, message: string): void {
  session.renderer.writeLine(session, message);
  session.renderer.renderPrompt(session);
}

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const THEME_ALIASES: Record<string, UiThemeName> = {
  TOKYO: "tokyo-night",
  "TOKYO-NIGHT": "tokyo-night",
  GRUVBOX: "gruvbox",
  GRUBBOX: "gruvbox",
};

export function helpCommand(session: UserSession): void {
  const lines: string[] = [
    "Available commands:",
    "  /register <username> <password> - create an account",
    "  /login <username> <password>    - log in",
    "  /logout                         - log out",
    "  /join <channel> [description]   - join or create a channel",
    "  /list                           - browse and join channels",
    "  /whoami                         - show session info",
    "  /clear                          - clear the screen",
    "  /theme <tokyo-night|gruvbox>    - change the terminal palette",
    "  /help                           - show this help",
    "",
    "Tip: type messages directly to chat. Commands start with /.",
  ];

  const title = "━━━ beanroom help ━━━";
  session.renderer.writeLine(session, title, {
    gradient: UI_THEMES[session.theme].bannerGradient,
  });
  for (const line of lines) reply(session, line);
}

export function whoamiCommand(session: UserSession): void {
  session.renderer.writePartsLine(session, [
    { text: "User: " },
    { text: `${session.user.name}`, style: { gradient: session.usernameGradient } },
  ]);
  session.renderer.writeLine(session, `Joined: ${session.joinedAt.toLocaleDateString()}`);
  session.renderer.writePartsLine(session, [
    { text: "Username color: Style " },
    { text: "Gradient ", style: { gradient: session.usernameGradient } },
    { text: `${session.usernameGradient[0]} `, style: { color: session.usernameGradient[0] } },
    { text: "to ", style: { color: "\x1b[97m" } },
    { text: session.usernameGradient[1], style: { color: session.usernameGradient[1] } },
  ]);
  session.renderer.renderPrompt(session);
}

export function clearCommand(session: UserSession): void {
  session.renderer.clear(session);
}

export function themeCommand(session: UserSession, args: string[]): void {
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

export async function colorCommand(session: UserSession, args: string[]): Promise<void> {
  const colorType = (args[0] ?? "").toUpperCase();
  let gradient: [string, string] | undefined;

  if (colorType === "SOLID") {
    if (!args[1] || !HEX_COLOR_PATTERN.test(args[1])) {
      reply(session, "Usage: /color SOLID <hex color>");
      return;
    }
    gradient = [args[1], args[1]];
  } else if (colorType === "GRADIENT") {
    if (
      !args[1] ||
      !HEX_COLOR_PATTERN.test(args[1]) ||
      !args[2] ||
      !HEX_COLOR_PATTERN.test(args[2])
    ) {
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
      reply(session, "Color changed but could not be saved.");
      return;
    }
  }

  session.renderer.renderPrompt(session);
}

export function announceCommand(session: UserSession, args: string[]): void {
  const text = args.join(" ").trim();
  if (text.length === 0) {
    session.renderer.showPopup(session, {
      title: "#announcements",
      author: session.user.name,
      timeAgo: "just now",
      lines: [
        "HEY!!~, You there. Yes you i am talking to you be nice. thats the first rule and just be a good human being",
        "",
        "this is an le anon chatroom or wtv you can do anything. this is being actively developed on. down below is just some useful stuff you should know",
        "list help about /list",
        "/login",
        "/register",
        " and other stuff ",
        "",
        "do /register it takes like 2 mins",
      ],
      controlsHint: "Enter continue  Esc/q close",
    });
    return;
  }

  session.chatRoom.broadcastPopup({
    title: "#announcements",
    author: session.user.name,
    timeAgo: "just now",
    lines: [text],
    controlsHint: "Enter continue  Esc/q close",
  });
  reply(session, "Broadcast announcement popup to all users.");
}
