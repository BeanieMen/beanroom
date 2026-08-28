import gradient from "gradient-string";

import { THEME } from "./config.js";
import { logger } from "./logger.js";

import type { ColorSupportLevel } from "../types/chat.js";
import type { UserSession } from "../types/session.js";
import type { ServerChannel } from "ssh2";

const ESC = "\x1b";
const ALT_BUFFER_ENTER = "\x1b[?1049h";
const ALT_BUFFER_LEAVE = "\x1b[?1049l";
const RESET = "\x1b[0m";

export interface TextStyle {
  color?: string;
  gradient?: readonly string[];
}

export function getTerminalColorSupport(term = ""): ColorSupportLevel {
  const value = term.toLowerCase().trim();
  if (["dumb", "raw", "unknown"].includes(value)) return 0;
  if (
    ["kitty", "ghostty", "foot", "alacritty", "wezterm", "rio", "warp"].some((name) =>
      value.includes(name),
    ) ||
    value.endsWith("-direct") ||
    value.endsWith("-truecolor")
  ) {
    return 3;
  }
  if (value.includes("256") || value.startsWith("tmux") || value.startsWith("screen")) return 2;
  return 1;
}

export function getUsernameColor(username: string): [string, string] {
  let hash = 0;
  for (let index = 0; index < username.length; index += 1) {
    hash = (hash * 31 + username.charCodeAt(index)) | 0;
  }
  const hue = (hash >>> 0) % 360;
  return [hslToHex(hue, 75, 50), hslToHex((hue + 30) % 360, 70, 60)];
}

export function formatTimestamp(date = new Date()): string {
  return `[${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}]`;
}

export class TerminalRenderer {
  open(session: UserSession): void {
    this.write(session.shell, `${ALT_BUFFER_ENTER}\x1b[2J\x1b[H`);
    this.setScrollRegion(session);
    this.write(session.shell, "\x1b[1;1H");
  }

  close(shell: ServerChannel): void {
    this.write(shell, `\x1b[r${ALT_BUFFER_LEAVE}`);
  }

  showWelcome(session: UserSession): void {
    this.writeLine(session, "╔══════════════════╗", { gradient: THEME.bannerGradient });
    this.writePartsLine(session, [
      { text: "║", style: { gradient: THEME.bannerGradient } },
      { text: "     BEANROOM     " },
      { text: "║", style: { gradient: THEME.bannerGradientReverse } },
    ]);
    this.writeLine(session, "╚══════════════════╝", { gradient: THEME.bannerGradient });
    this.writeLine(
      session,
      "Welcome to Beanroom. Be kind, and use /register <username> <password> to save your preferences.",
      { color: THEME.welcomeColor },
    );
    this.writeLine(session, "");
  }

  writeLine(session: UserSession, text: string, style: TextStyle = {}): void {
    this.withMessageCursor(session, () => {
      this.writeStyled(session, text, style);
      this.write(session.shell, "\r\n");
    });
  }

  writeUserMessage(
    session: UserSession,
    sender: string,
    message: string,
    senderGradient: [string, string],
    timestamp: string,
  ): void {
    this.withMessageCursor(session, () => {
      this.writePart(session, `${timestamp} `, { color: THEME.systemColor });
      this.writePart(session, sender, { gradient: senderGradient });
      this.writePart(session, " > ");
      this.writePart(session, message, { color: THEME.white });
      this.write(session.shell, "\r\n");
    });
  }

  renderPrompt(session: UserSession): void {
    if (this.hasComposer(session)) {
      this.renderComposer(session);
      return;
    }
    const row = Math.max(1, session.term.rows);
    this.write(session.shell, `\x1b[${String(row)};1H\r\x1b[K`);
    this.writePart(session, `${session.user.name} > `, { gradient: session.usernameGradient });
    this.writePart(session, session.inputBuffer, { color: THEME.white });
  }

  maxInputLength(session: UserSession): number {
    if (!this.hasComposer(session)) return 512;
    const inputWidth = session.term.cols - 4 - visibleWidth(session.user.name) - 3;
    return Math.max(0, Math.min(512, inputWidth));
  }

  clear(session: UserSession): void {
    this.write(session.shell, "\x1b[2J\x1b[H");
    this.setScrollRegion(session);
    this.renderPrompt(session);
  }

  resize(session: UserSession, rows: number, cols: number): void {
    session.term.rows = Math.max(2, rows);
    session.term.cols = Math.max(1, cols);
    this.setScrollRegion(session);
    this.renderPrompt(session);
  }

  private withMessageCursor(session: UserSession, writeMessage: () => void): void {
    const messageRow = this.messageBottom(session);
    this.write(session.shell, "\x1b[s");
    this.setScrollRegion(session);
    this.write(session.shell, `\x1b[${String(messageRow)};1H\r\x1b[K`);
    writeMessage();
    this.write(session.shell, "\x1b[u");
  }

  private setScrollRegion(session: UserSession): void {
    const bottom = this.messageBottom(session);
    this.write(session.shell, `\x1b[1;${String(bottom)}r`);
  }

  private writePartsLine(session: UserSession, parts: { text: string; style?: TextStyle }[]): void {
    this.withMessageCursor(session, () => {
      for (const part of parts) this.writePart(session, part.text, part.style);
      this.write(session.shell, "\r\n");
    });
  }

  private renderComposer(session: UserSession): void {
    const topRow = session.term.rows - 2;
    const inputRow = session.term.rows - 1;
    const width = session.term.cols;
    const bodyWidth = width - 4;
    const promptWidth = visibleWidth(session.user.name) + 3;
    const input = truncate(session.inputBuffer, Math.max(0, bodyWidth - promptWidth));
    const padding = " ".repeat(Math.max(0, bodyWidth - promptWidth - visibleWidth(input)));

    this.write(session.shell, `\x1b[${String(topRow)};1H\r\x1b[K`);
    this.writePart(session, topBorder(width), { color: THEME.systemColor });
    this.write(session.shell, `\x1b[${String(inputRow)};1H\r\x1b[K`);
    this.writePart(session, "│ ", { color: THEME.systemColor });
    this.writePart(session, session.user.name, { gradient: session.usernameGradient });
    this.writePart(session, " > ", { color: THEME.white });
    this.writePart(session, input, { color: THEME.white });
    this.writePart(session, padding, { color: THEME.systemColor });
    this.writePart(session, " │", { color: THEME.systemColor });
    this.write(session.shell, `\x1b[${String(session.term.rows)};1H\r\x1b[K`);
    this.writePart(session, `└${"─".repeat(width - 2)}┘`, { color: THEME.systemColor });

    const cursorColumn = 3 + promptWidth + visibleWidth(input);
    this.write(session.shell, `\x1b[${String(inputRow)};${String(cursorColumn)}H`);
  }

  private hasComposer(session: UserSession): boolean {
    return session.term.rows >= 5 && session.term.cols >= 30;
  }

  private messageBottom(session: UserSession): number {
    return this.hasComposer(session) ? session.term.rows - 3 : Math.max(1, session.term.rows - 1);
  }

  private writeStyled(session: UserSession, text: string, style: TextStyle): void {
    this.writePart(session, text, style);
  }

  private writePart(session: UserSession, text: string, style: TextStyle = {}): void {
    if (text.length === 0) return;
    const output =
      style.gradient !== undefined
        ? colorGradient(text, style.gradient, session.colorLevel)
        : colorText(text, style.color, session.colorLevel);
    this.write(session.shell, `${output}${RESET}`);
  }

  private write(shell: ServerChannel, data: string): void {
    try {
      shell.write(data);
    } catch (error) {
      logger.warn(`Terminal write failed: ${String(error)}`);
    }
  }
}

export class InputHandler {
  private escapeSequence = "";

  constructor(
    private readonly session: UserSession,
    private readonly onSubmit: (message: string) => void,
  ) {}

  handle(data: Buffer): void {
    for (const character of data.toString("utf8")) this.handleCharacter(character);
  }

  private handleCharacter(character: string): void {
    if (this.consumeEscapeSequence(character)) return;
    if (character === "\r" || character === "\n") {
      const message = this.session.inputBuffer.trim();
      this.session.inputBuffer = "";
      if (message.length > 0) this.onSubmit(message);
      else this.session.renderer.renderPrompt(this.session);
      return;
    }
    if (character === "\x7f" || character === "\x08") {
      this.session.inputBuffer = this.session.inputBuffer.slice(0, -1);
      this.session.renderer.renderPrompt(this.session);
      return;
    }
    if (character === "\x03") {
      this.close();
      return;
    }
    if (
      character >= " " &&
      this.session.inputBuffer.length < this.session.renderer.maxInputLength(this.session) &&
      !isControlCharacter(character)
    ) {
      this.session.inputBuffer += character;
      this.session.renderer.renderPrompt(this.session);
    }
  }

  private close(): void {
    this.session.renderer.close(this.session.shell);
    this.session.shell.end();
  }

  private consumeEscapeSequence(character: string): boolean {
    if (this.escapeSequence.length > 0) {
      this.escapeSequence += character;
      if (this.escapeSequence.length > 2 && isEscapeSequenceFinal(character)) {
        this.escapeSequence = "";
      } else if (this.escapeSequence.length > 32) {
        this.escapeSequence = "";
      }
      return true;
    }
    if (character.codePointAt(0) === 27) {
      this.escapeSequence = character;
      return true;
    }
    return false;
  }
}

function colorText(text: string, color: string | undefined, level: ColorSupportLevel): string {
  if (level === 0) return text;
  if (color === undefined) return text;
  if (color.startsWith("\x1b[")) return `${color}${text}`;
  const [red, green, blue] = hexToRgb(color);
  if (level === 3) return `\x1b[38;2;${String(red)};${String(green)};${String(blue)}m${text}`;
  if (level === 2) return `\x1b[38;5;${String(rgbTo256(red, green, blue))}m${text}`;
  return `\x1b[${String(rgbTo16(red, green, blue))}m${text}`;
}

function colorGradient(text: string, colors: readonly string[], level: ColorSupportLevel): string {
  if (level === 0) return text;
  const rendered = gradient([...colors])(text);
  if (level === 3) return rendered;
  return rendered.replace(
    new RegExp(`${ESC}\\x5b38;2;(\\d+);(\\d+);(\\d+)m`, "g"),
    (_match, red: string, green: string, blue: string) => {
      const r = Number(red);
      const g = Number(green);
      const b = Number(blue);
      return level === 2
        ? `\x1b[38;5;${String(rgbTo256(r, g, b))}m`
        : `\x1b[${String(rgbTo16(r, g, b))}m`;
    },
  );
}

function hexToRgb(color: string): [number, number, number] {
  const value = color.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function rgbTo256(red: number, green: number, blue: number): number {
  return (
    16 +
    36 * Math.round((red / 255) * 5) +
    6 * Math.round((green / 255) * 5) +
    Math.round((blue / 255) * 5)
  );
}

function rgbTo16(red: number, green: number, blue: number): number {
  let code = 30;
  if (red > 64) code += 1;
  if (green > 64) code += 2;
  if (blue > 64) code += 4;
  return code + (red > 128 || green > 128 || blue > 128 ? 60 : 0);
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const sector = hue / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const [red, green, blue] =
    sector < 1
      ? [chroma, x, 0]
      : sector < 2
        ? [x, chroma, 0]
        : sector < 3
          ? [0, chroma, x]
          : sector < 4
            ? [0, x, chroma]
            : sector < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const match = l - chroma / 2;
  return `#${[red, green, blue]
    .map((value) =>
      Math.round((value + match) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function isControlCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code < 32 || code === 127;
}

function isEscapeSequenceFinal(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code >= 64 && code <= 126;
}

function visibleWidth(text: string): number {
  return Array.from(text).length;
}

function truncate(text: string, width: number): string {
  return Array.from(text).slice(0, width).join("");
}

function topBorder(width: number): string {
  const label = "─ BEANROOM ";
  return `┌${label}${"─".repeat(Math.max(0, width - label.length - 2))}┐`;
}
