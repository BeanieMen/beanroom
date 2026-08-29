import gradient from "gradient-string";

import { UI_THEMES, type UiThemeName } from "./config.js";
import { logger } from "./logger.js";

import type { ColorSupportLevel } from "../types/chat.js";
import type { PopupModal, UserSession } from "../types/session.js";
import type { ServerChannel } from "ssh2";

const ESC = "\x1b";
const ALT_BUFFER_ENTER = "\x1b[?1049h";
const ALT_BUFFER_LEAVE = "\x1b[?1049l";
const RESET = "\x1b[0m";
const OSC_TERMINATOR = "\x1b\\";

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
  private readonly beanAnimations = new Map<
    ServerChannel,
    { atTop: boolean; timer: ReturnType<typeof setInterval> }
  >();

  open(session: UserSession): void {
    this.write(session.shell, ALT_BUFFER_ENTER);
    this.startBeanAnimation(session);
    this.redraw(session);
  }

  close(shell: ServerChannel): void {
    const animation = this.beanAnimations.get(shell);
    if (animation !== undefined) {
      clearInterval(animation.timer);
      this.beanAnimations.delete(shell);
    }
    // Restore the user's terminal colours after leaving the alternate buffer.
    this.write(
      shell,
      `\x1b[r\x1b]110${OSC_TERMINATOR}\x1b]111${OSC_TERMINATOR}\x1b]112${OSC_TERMINATOR}${ALT_BUFFER_LEAVE}`,
    );
  }

  showWelcome(session: UserSession): void {
    const theme = this.theme(session);
    this.writeLine(session, "╔══════════════════╗", { gradient: theme.bannerGradient });
    this.writePartsLine(session, [
      { text: "║", style: { gradient: theme.bannerGradient } },
      { text: "     BEANROOM     " },
      { text: "║", style: { gradient: theme.bannerGradientReverse } },
    ]);
    this.writeLine(session, "╚══════════════════╝", { gradient: theme.bannerGradient });
    this.writeLine(
      session,
      "Welcome to Beanroom. Be kind, and use /register <username> <password> to save your preferences.",
      { color: theme.highlight },
    );
    this.writeLine(session, "");
  }

  openChannelList(session: UserSession): void {
    const channels = session.chatRoom.listChannelDetails();
    const current = session.currentChannel?.name;
    const selected = Math.max(
      0,
      channels.findIndex((channel) => channel.name === current),
    );
    session.inputBuffer = "";
    session.channelList = { selected };
    this.renderChannelList(session);
  }

  closeChannelList(session: UserSession): void {
    if (session.channelList === null) return;
    session.channelList = null;
    this.redraw(session);
  }

  moveChannelList(session: UserSession, direction: -1 | 1): void {
    const state = session.channelList;
    const channels = session.chatRoom.listChannelDetails();
    if (state === null || channels.length === 0) return;
    state.selected = (state.selected + direction + channels.length) % channels.length;
    this.renderChannelList(session);
  }

  selectedChannelName(session: UserSession): string | undefined {
    const selected = session.channelList?.selected;
    if (selected === undefined) return undefined;
    return session.chatRoom.listChannelDetails()[selected]?.name;
  }

  showPopup(session: UserSession, popup: PopupModal): void {
    session.activePopup = popup;
    this.redraw(session);
  }

  closePopup(session: UserSession): void {
    if (session.activePopup === null) return;
    const popup = session.activePopup;
    session.activePopup = null;
    if (popup.onClose) {
      try {
        popup.onClose();
      } catch (err) {
        logger.warn(`Popup onClose callback error: ${String(err)}`);
      }
    }
    this.redraw(session);
  }

  writeLine(session: UserSession, text: string, style: TextStyle = {}): void {
    if (session.channelList !== null) return;
    if (this.hasFramedLayout(session)) {
      this.withMessageCursor(session, () => {
        this.writeFramedParts(session, [{ text, style }]);
      });
      if (session.activePopup !== null) this.renderPopup(session);
      return;
    }
    this.withMessageCursor(session, () => {
      this.writeStyled(session, text, style);
      this.write(session.shell, "\r\n");
    });
    if (session.activePopup !== null) this.renderPopup(session);
  }

  writeUserMessage(
    session: UserSession,
    sender: string,
    message: string,
    senderGradient: [string, string],
    timestamp: string,
  ): void {
    if (session.channelList !== null) return;
    this.writePartsLine(session, [
      { text: `${timestamp} `, style: { color: this.theme(session).muted } },
      { text: sender, style: { gradient: senderGradient } },
      { text: " > " },
      { text: message, style: { color: this.theme(session).foreground } },
    ]);
  }

  renderPrompt(session: UserSession): void {
    if (session.channelList !== null) {
      this.renderChannelList(session);
      return;
    }
    if (this.hasFramedLayout(session)) {
      this.renderComposer(session);
      if (session.activePopup !== null) this.renderPopup(session);
      return;
    }
    if (this.hasComposer(session)) {
      this.renderComposer(session);
      if (session.activePopup !== null) this.renderPopup(session);
      return;
    }
    const row = Math.max(1, session.term.rows);
    this.write(session.shell, `\x1b[${String(row)};1H\r\x1b[K`);
    this.writePart(session, `${session.user.name} > `, { gradient: session.usernameGradient });
    this.writePart(session, session.inputBuffer, { color: this.theme(session).foreground });
    if (session.activePopup !== null) this.renderPopup(session);
  }

  maxInputLength(session: UserSession): number {
    if (!this.hasFramedLayout(session)) return 512;
    const inputWidth = session.term.cols - 4 - visibleWidth(session.user.name) - 3;
    return Math.max(0, Math.min(512, inputWidth));
  }

  clear(session: UserSession): void {
    this.redraw(session);
  }

  resize(session: UserSession, rows: number, cols: number): void {
    session.term.rows = Math.max(2, rows);
    session.term.cols = Math.max(1, cols);
    this.redraw(session);
  }

  redraw(session: UserSession): void {
    if (session.channelList !== null) {
      this.renderChannelList(session);
      return;
    }
    this.write(session.shell, "\x1b[r\x1b[2J\x1b[H");
    this.applyScreenTheme(session);
    if (this.hasFramedLayout(session)) this.drawFrame(session);
    this.setScrollRegion(session);
    this.renderPrompt(session);
    if (session.activePopup !== null) {
      this.renderPopup(session);
    }
  }

  refreshFrameHeader(session: UserSession): void {
    if (session.channelList !== null || !this.hasFramedLayout(session)) return;
    this.drawFrameHeader(session);
    this.restorePromptCursor(session);
  }

  withMessageCursor(session: UserSession, writeMessage: () => void): void {
    const messageRow = this.messageBottom(session);
    this.setScrollRegion(session);
    this.write(
      session.shell,
      this.hasFramedLayout(session)
        ? `\x1b[${String(messageRow)};1H\r`
        : `\x1b[${String(messageRow)};1H\r\x1b[K`,
    );
    writeMessage();
    this.restorePromptCursor(session);
  }

  private setScrollRegion(session: UserSession): void {
    const bottom = this.messageBottom(session);
    const top = this.hasFramedLayout(session) ? 5 : 1;
    this.write(session.shell, `\x1b[${String(top)};${String(bottom)}r`);
  }

  writePartsLine(session: UserSession, parts: { text: string; style?: TextStyle }[]): void {
    if (this.hasFramedLayout(session)) {
      this.withMessageCursor(session, () => {
        this.writeFramedParts(session, parts);
      });
      return;
    }
    this.withMessageCursor(session, () => {
      for (const part of parts) this.writePart(session, part.text, part.style);
      this.write(session.shell, "\r\n");
    });
  }

  private renderComposer(session: UserSession): void {
    const topRow = session.term.rows - 2;
    const inputRow = session.term.rows - 1;
    const width = session.term.cols;
    const theme = this.theme(session);
    const bodyWidth = width - 4;
    const promptWidth = visibleWidth(session.user.name) + 3;
    const input = truncate(session.inputBuffer, Math.max(0, bodyWidth - promptWidth));
    const padding = " ".repeat(Math.max(0, bodyWidth - promptWidth - visibleWidth(input)));

    this.write(session.shell, `\x1b[${String(topRow)};1H\r\x1b[K`);
    const typing = session.currentChannel?.typingIndicatorFor(session.id);
    const composerLabel = typing
      ? ` ${typing}  ·  compose  ·  enter sends `
      : " compose  ·  enter sends  ·  /help for commands ";
    this.writePart(session, ruleBorder(width, composerLabel), {
      color: theme.border,
    });
    this.write(session.shell, `\x1b[${String(inputRow)};1H\r\x1b[K`);
    this.writePart(session, "│ ", { color: theme.border });
    this.writePart(session, session.user.name, { gradient: session.usernameGradient });
    this.writePart(session, " > ", { color: theme.foreground });
    this.writePart(session, input, { color: theme.foreground });
    this.writePart(session, padding, { color: theme.muted });
    this.writePart(session, " │", { color: theme.border });
    this.write(session.shell, `\x1b[${String(session.term.rows)};1H\r\x1b[K`);
    this.writePart(session, `╰${"─".repeat(width - 2)}╯`, { color: theme.border });

    const cursorColumn = 3 + promptWidth + visibleWidth(input);
    this.write(session.shell, `\x1b[${String(inputRow)};${String(cursorColumn)}H`);
  }

  private hasComposer(session: UserSession): boolean {
    return session.term.rows >= 5 && session.term.cols >= 30;
  }

  private hasFramedLayout(session: UserSession): boolean {
    return session.term.rows >= 11 && session.term.cols >= 42;
  }

  private messageBottom(session: UserSession): number {
    return this.hasFramedLayout(session)
      ? session.term.rows - 3
      : this.hasComposer(session)
        ? session.term.rows - 3
        : Math.max(1, session.term.rows - 1);
  }

  writeStyled(session: UserSession, text: string, style: TextStyle): void {
    this.writePart(session, text, style);
  }

  private applyScreenTheme(session: UserSession): void {
    const theme = this.theme(session);
    this.write(
      session.shell,
      `\x1b]10;${theme.foreground}${OSC_TERMINATOR}\x1b]11;${theme.background}${OSC_TERMINATOR}\x1b]12;${theme.accent}${OSC_TERMINATOR}`,
    );
  }

  private renderChannelList(session: UserSession): void {
    const state = session.channelList;
    if (state === null) return;

    const channels = session.chatRoom.listChannelDetails();
    const { cols, rows } = session.term;
    const theme = this.theme(session);
    const footerTop = Math.max(4, rows - 2);
    const firstEntryRow = 4;
    const pageSize = Math.max(1, Math.floor((footerTop - firstEntryRow) / 2));
    state.selected = Math.min(state.selected, Math.max(0, channels.length - 1));
    const pageStart = Math.floor(state.selected / pageSize) * pageSize;
    const visibleChannels = channels.slice(pageStart, pageStart + pageSize);

    this.write(session.shell, "\x1b[r\x1b[2J\x1b[H");
    this.applyScreenTheme(session);
    this.writeStaticRow(session, 1, topBorder(cols, " CHANNEL DIRECTORY "), {
      gradient: theme.bannerGradient,
    });
    this.writeStaticRow(
      session,
      2,
      boxBorder(cols, `${String(channels.length)} rooms  ·  browse the Beanroom`),
      { color: theme.highlight },
    );
    this.writeStaticRow(session, 3, ruleBorder(cols, " select a room "), { color: theme.border });

    let row = firstEntryRow;
    for (const [offset, channel] of visibleChannels.entries()) {
      const index = pageStart + offset;
      const selected = index === state.selected;
      this.writeStaticRow(
        session,
        row,
        boxBorder(
          cols,
          `${selected ? "›" : " "} #${channel.name}  ·  ${String(channel.count())} online`,
        ),
        { color: selected ? theme.warm : theme.foreground },
      );
      this.writeStaticRow(session, row + 1, boxBorder(cols, `    ${channel.description}`), {
        color: selected ? theme.highlight : theme.muted,
      });
      row += 2;
    }
    while (row < footerTop) {
      this.writeStaticRow(session, row, boxBorder(cols, ""), { color: theme.border });
      row += 1;
    }

    this.writeStaticRow(session, footerTop, ruleBorder(cols, " ↑/↓ or j/k to move "), {
      color: theme.border,
    });
    this.writeStaticRow(session, footerTop + 1, boxBorder(cols, " enter joins  ·  q / esc returns to chat "), {
      color: theme.highlight,
    });
    this.writeStaticRow(session, rows, `╰${"─".repeat(Math.max(0, cols - 2))}╯`, {
      color: theme.border,
    });
  }

  private drawFrame(session: UserSession): void {
    const { cols } = session.term;
    this.drawFrameHeader(session);

    for (let row = 5; row <= this.messageBottom(session); row += 1) {
      this.writeStaticRow(session, row, boxBorder(cols, ""), { color: this.theme(session).border });
    }
  }

  private drawFrameHeader(session: UserSession): void {
    const { cols } = session.term;
    const theme = this.theme(session);
    const channel = session.currentChannel?.name ?? "general";
    const members = session.currentChannel?.count() ?? 0;
    const beanAtTop = this.beanAnimations.get(session.shell)?.atTop ?? true;
    const bean = "  🫘  ";
    const status = `beanroom  ·  #${channel}  ·  ${String(members)} online  ·  type /help`;

    this.writeStaticRow(session, 1, topBorder(cols, ` BEANROOM // ${theme.label} `), {
      gradient: theme.bannerGradient,
    });
    this.writeStaticRow(
      session,
      2,
      boxBorder(cols, `${beanAtTop ? bean : " ".repeat(bean.length)}${status}`),
      { color: theme.highlight },
    );
    this.writeStaticRow(
      session,
      3,
      boxBorder(
        cols,
        `${beanAtTop ? " ".repeat(bean.length) : bean}a tiny bean drifting through the room`,
      ),
      { color: theme.accent },
    );
    this.writeStaticRow(
      session,
      4,
      ruleBorder(cols, " activity feed  ·  say hello  ·  stay awhile "),
      {
        color: theme.border,
      },
    );
  }

  private renderPopup(session: UserSession): void {
    const popup = session.activePopup;
    if (popup === null) return;

    const { cols, rows } = session.term;
    const theme = this.theme(session);

    // Calculate dimensions
    const maxWidth = Math.max(30, cols - 6);
    const boxWidth = Math.min(68, maxWidth);
    
    // Wrap popup body lines to fit inside box
    const innerWidth = boxWidth - 4; // 2 padding/border each side
    const wrappedLines: { text: string; indent?: boolean }[] = [];
    for (const rawLine of popup.lines) {
      if (rawLine === "") {
        wrappedLines.push({ text: "" });
        continue;
      }
      const words = rawLine.split(" ");
      let currentLine = "";
      for (const word of words) {
        if (currentLine === "") {
          if (visibleWidth(word) > innerWidth) {
            wrappedLines.push({ text: truncate(word, innerWidth) });
          } else {
            currentLine = word;
          }
        } else if (visibleWidth(currentLine) + 1 + visibleWidth(word) <= innerWidth) {
          currentLine += " " + word;
        } else {
          wrappedLines.push({ text: currentLine });
          currentLine = word;
        }
      }
      if (currentLine !== "") {
        wrappedLines.push({ text: currentLine });
      }
    }

    const headerHeight = (popup.author || popup.timeAgo) ? 2 : 1;
    const footerHeight = popup.controlsHint ? 2 : 1;
    const contentHeight = wrappedLines.length;
    const boxHeight = headerHeight + contentHeight + footerHeight + 1; // +1 top border

    const startRow = Math.max(2, Math.floor((rows - boxHeight) / 2));
    const startCol = Math.max(1, Math.floor((cols - boxWidth) / 2));

    // Top border with title
    const titleStr = popup.title;
    const topText = topBorder(boxWidth, ` ${titleStr} `);
    this.writeAt(session, startRow, startCol, topText, { color: theme.border });

    let currentOffset = 1;

    // Optional author line
    if (popup.author || popup.timeAgo) {
      const authorPart = popup.author ? `@${popup.author}` : "";
      const timePart = popup.timeAgo ? ` ${popup.timeAgo}` : "";
      const metaText = `${authorPart}${timePart}`;
      const headerLine = boxBorder(boxWidth, metaText);
      this.writeAt(session, startRow + currentOffset, startCol, headerLine, { color: theme.highlight, fillBg: true });
      currentOffset += 1;
    }

    // Body lines
    for (const item of wrappedLines) {
      const lineStr = item.text;
      const isBullet = lineStr.trim().startsWith("•") || lineStr.trim().startsWith("-");
      const isCommand = lineStr.trim().startsWith("/");
      const color = isBullet || isCommand ? theme.warm : theme.foreground;
      
      const formatted = boxBorder(boxWidth, lineStr);
      this.writeAt(session, startRow + currentOffset, startCol, formatted, { color, fillBg: true });
      currentOffset += 1;
    }

    // Controls hint
    if (popup.controlsHint) {
      const hintLine = ruleBorder(boxWidth, ` ${popup.controlsHint} `);
      this.writeAt(session, startRow + currentOffset, startCol, hintLine, { color: theme.muted, fillBg: true });
      currentOffset += 1;
    }

    // Bottom border
    const bottomLine = `╰${"─".repeat(Math.max(0, boxWidth - 2))}╯`;
    this.writeAt(session, startRow + currentOffset, startCol, bottomLine, { color: theme.border });

    // Restore cursor position back to the prompt line after drawing popup
    this.restorePromptCursor(session);
  }

  private restorePromptCursor(session: UserSession): void {
    if (session.channelList !== null) return;
    if (this.hasFramedLayout(session) || this.hasComposer(session)) {
      const inputRow = session.term.rows - 1;
      const promptWidth = visibleWidth(session.user.name) + 3;
      const bodyWidth = session.term.cols - 4;
      const input = truncate(session.inputBuffer, Math.max(0, bodyWidth - promptWidth));
      const cursorColumn = 3 + promptWidth + visibleWidth(input);
      this.write(session.shell, `\x1b[${String(inputRow)};${String(cursorColumn)}H`);
    } else {
      const row = Math.max(1, session.term.rows);
      const promptWidth = visibleWidth(session.user.name) + 3;
      const cursorColumn = 1 + promptWidth + visibleWidth(session.inputBuffer);
      this.write(session.shell, `\x1b[${String(row)};${String(cursorColumn)}H`);
    }
  }

  private writeAt(
    session: UserSession,
    row: number,
    col: number,
    text: string,
    style: TextStyle & { fillBg?: boolean },
  ): void {
    this.write(session.shell, `\x1b[${String(row)};${String(col)}H`);
    if (style.fillBg) {
      const [r, g, b] = hexToRgb(this.theme(session).background);
      const bgCode =
        session.colorLevel === 3
          ? `\x1b[48;2;${String(r)};${String(g)};${String(b)}m`
          : session.colorLevel === 2
            ? `\x1b[48;5;${String(rgbTo256(r, g, b))}m`
            : "";
      this.write(session.shell, bgCode);
    }
    this.writePart(session, text, style);
  }

  private writeFramedParts(
    session: UserSession,
    parts: { text: string; style?: TextStyle }[],
  ): void {
    const contentWidth = session.term.cols - 4;
    const lines: { text: string; style?: TextStyle }[][] = [[]];
    let remaining = contentWidth;

    for (const part of parts) {
      const characters = Array.from(part.text);
      while (characters.length > 0) {
        if (remaining === 0) {
          lines.push([]);
          remaining = contentWidth;
        }
        const chunk = characters.splice(0, remaining).join("");
        const line = lines[lines.length - 1];
        if (line !== undefined) {
          line.push(
            part.style === undefined ? { text: chunk } : { text: chunk, style: part.style },
          );
        }
        remaining -= visibleWidth(chunk);
      }
    }

    for (const line of lines) {
      this.write(session.shell, "\x1b[S");
      this.write(session.shell, `\x1b[${String(this.messageBottom(session))};1H\r`);
      this.writeFramedLine(session, line);
    }
  }

  private writeFramedLine(
    session: UserSession,
    parts: { text: string; style?: TextStyle }[],
  ): void {
    const theme = this.theme(session);
    const contentWidth = session.term.cols - 4;
    const used = parts.reduce((width, part) => width + visibleWidth(part.text), 0);
    this.writePart(session, "│ ", { color: theme.border });
    for (const part of parts) this.writePart(session, part.text, part.style);
    this.writePart(session, " ".repeat(Math.max(0, contentWidth - used)), { color: theme.muted });
    this.writePart(session, " │", { color: theme.border });
  }

  private writeStaticRow(session: UserSession, row: number, text: string, style: TextStyle): void {
    this.write(session.shell, `\x1b[${String(row)};1H\r\x1b[K`);
    this.writePart(session, text, style);
  }

  private theme(session: UserSession): (typeof UI_THEMES)[UiThemeName] {
    return UI_THEMES[session.theme];
  }

  private startBeanAnimation(session: UserSession): void {
    const previous = this.beanAnimations.get(session.shell);
    if (previous !== undefined) clearInterval(previous.timer);

    const animation = {
      atTop: true,
      timer: setInterval(() => {
        const current = this.beanAnimations.get(session.shell);
        if (current === undefined) return;
        current.atTop = !current.atTop;
        this.refreshFrameHeader(session);
      }, 700),
    };
    this.beanAnimations.set(session.shell, animation);
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
  private escapeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly session: UserSession,
    private readonly onSubmit: (message: string) => void,
    private readonly onSelectChannel?: (channelName: string) => void,
  ) {}

  handle(data: Buffer): void {
    for (const character of data.toString("utf8")) this.handleCharacter(character);
  }

  private consumeEscapeSequence(character: string): boolean {
    if (character === "\x1b") {
      this.escapeSequence += "\x1b";
      this.armEscapeTimeout();
      return true;
    }
    if (this.escapeSequence.length === 0) return false;
    if (this.escapeSequence.length === 1 && !isSequenceIntroducer(character)) {
      // Lone ESC followed by a non-introducer = an Alt-modified key. Drop both.
      this.escapeSequence = "";
      this.clearEscapeTimeout();
      return true;
    }
    this.escapeSequence += character;
    if (this.session.channelList !== null) {
      if (this.escapeSequence === "\x1b[A" || this.escapeSequence === "\x1bOA") {
        this.session.renderer.moveChannelList(this.session, -1);
        this.escapeSequence = "";
        this.clearEscapeTimeout();
        return true;
      }
      if (this.escapeSequence === "\x1b[B" || this.escapeSequence === "\x1bOB") {
        this.session.renderer.moveChannelList(this.session, 1);
        this.escapeSequence = "";
        this.clearEscapeTimeout();
        return true;
      }
    }
    if (this.escapeSequence.length > 32 || isSequenceTerminator(character)) {
      this.escapeSequence = "";
      this.clearEscapeTimeout();
    } else {
      this.armEscapeTimeout();
    }
    return true;
  }

  private armEscapeTimeout(): void {
    if (this.escapeTimer !== null) clearTimeout(this.escapeTimer);
    this.escapeTimer = setTimeout(() => {
      this.escapeTimer = null;
      if (this.escapeSequence === "\x1b") {
        if (this.session.activePopup !== null) {
          this.session.renderer.closePopup(this.session);
        } else if (this.session.channelList !== null) {
          this.session.renderer.closeChannelList(this.session);
        }
      }
      this.escapeSequence = "";
    }, 25);
  }

  private clearEscapeTimeout(): void {
    if (this.escapeTimer !== null) {
      clearTimeout(this.escapeTimer);
      this.escapeTimer = null;
    }
  }

  private handleCharacter(character: string): void {
    if (this.consumeEscapeSequence(character)) return;

    if (this.session.activePopup !== null) {
      if (
        character === "\r" ||
        character === "\n" ||
        character === "q" ||
        character === "Q" ||
        character === "\x1b" ||
        character === " "
      ) {
        this.session.renderer.closePopup(this.session);
        return;
      }
      if (character === "\x03") {
        this.session.renderer.closePopup(this.session);
        return;
      }
      return;
    }

    if (this.session.channelList !== null) {
      if (character === "k" || character === "K") {
        this.session.renderer.moveChannelList(this.session, -1);
        return;
      }
      if (character === "j" || character === "J") {
        this.session.renderer.moveChannelList(this.session, 1);
        return;
      }
      if (character === "q" || character === "Q") {
        this.session.renderer.closeChannelList(this.session);
        return;
      }
      if (character === "\r" || character === "\n") {
        const selected = this.session.renderer.selectedChannelName(this.session);
        if (selected !== undefined && this.onSelectChannel !== undefined) {
          this.onSelectChannel(selected);
        } else {
          this.session.renderer.closeChannelList(this.session);
        }
        return;
      }
      if (character === "\x03") {
        this.session.renderer.closeChannelList(this.session);
        return;
      }
      return;
    }

    if (character === "\r" || character === "\n") {
      this.session.currentChannel?.setTyping(this.session.id, false);
      const message = this.session.inputBuffer.trim();
      this.session.inputBuffer = "";
      if (message.length > 0) this.onSubmit(message);
      else this.session.renderer.renderPrompt(this.session);
      return;
    }
    if (character === "\x7f" || character === "\x08") {
      this.session.inputBuffer = this.session.inputBuffer.slice(0, -1);
      if (this.session.inputBuffer.length === 0 || this.session.inputBuffer.startsWith("/")) {
        this.session.currentChannel?.setTyping(this.session.id, false);
      } else {
        this.session.currentChannel?.setTyping(this.session.id, true);
      }
      this.session.renderer.renderPrompt(this.session);
      return;
    }
    if (character === "\x03") {
      this.session.currentChannel?.setTyping(this.session.id, false);
      this.close();
      return;
    }
    if (
      character >= " " &&
      this.session.inputBuffer.length < this.session.renderer.maxInputLength(this.session) &&
      !isControlCharacter(character)
    ) {
      this.session.inputBuffer += character;
      if (!this.session.inputBuffer.startsWith("/")) {
        this.session.currentChannel?.setTyping(this.session.id, true);
      } else {
        this.session.currentChannel?.setTyping(this.session.id, false);
      }
      this.session.renderer.renderPrompt(this.session);
    }
  }

  private close(): void {
    this.session.renderer.close(this.session.shell);
    this.session.shell.end();
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

function isSequenceIntroducer(character: string): boolean {
  return '[]OPX^_()#%!*+"'.includes(character);
}

function isSequenceTerminator(character: string): boolean {
  if (character === "\x07") return true;
  const code = character.codePointAt(0) ?? 0;
  return code >= 64 && code <= 126 && !isSequenceIntroducer(character);
}

function visibleWidth(text: string): number {
  return Array.from(text).length;
}

function truncate(text: string, width: number): string {
  return Array.from(text).slice(0, width).join("");
}

function topBorder(width: number, label: string): string {
  const innerWidth = Math.max(0, width - 2);
  const text = truncate(label, innerWidth);
  return `╭${text}${"─".repeat(Math.max(0, innerWidth - visibleWidth(text)))}╮`;
}

function ruleBorder(width: number, label: string): string {
  const innerWidth = Math.max(0, width - 2);
  const text = truncate(label, innerWidth);
  const left = Math.floor(Math.max(0, innerWidth - visibleWidth(text)) / 2);
  const right = Math.max(0, innerWidth - visibleWidth(text) - left);
  return `├${"─".repeat(left)}${text}${"─".repeat(right)}┤`;
}

function boxBorder(width: number, content: string): string {
  const innerWidth = Math.max(0, width - 4);
  const text = truncate(content, innerWidth);
  return `│ ${text}${" ".repeat(Math.max(0, innerWidth - visibleWidth(text)))} │`;
}
