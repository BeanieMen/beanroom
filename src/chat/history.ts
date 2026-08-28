import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "fs";

import { APP_CONFIG } from "../helpers/config.js";

import type { ChatLogEntry } from "../types/chat.js";

const MAX_LOG_BYTES = 10 * 1024 * 1024;

export class HistoryService {
  constructor(private readonly file = "chatlog.txt") {}

  append(entry: ChatLogEntry): void {
    this.rotateIfNeeded();
    const safeEntry: ChatLogEntry = {
      sender: clean(entry.sender, 64),
      message: clean(entry.message, APP_CONFIG.maxMessageLength),
      timestamp: entry.timestamp,
    };
    writeFileSync(this.file, `${JSON.stringify(safeEntry)}\n`, { flag: "a" });
  }

  recent(limit: number): ChatLogEntry[] {
    if (!existsSync(this.file)) return [];
    try {
      return readFileSync(this.file, "utf8")
        .trim()
        .split("\n")
        .slice(-limit)
        .flatMap((line) => parseEntry(line));
    } catch {
      return [];
    }
  }

  private rotateIfNeeded(): void {
    if (!existsSync(this.file) || statSync(this.file).size <= MAX_LOG_BYTES) return;
    try {
      renameSync(this.file, `${this.file}.old`);
    } catch {
      writeFileSync(this.file, "");
    }
  }
}

function clean(value: string, limit: number): string {
  return Array.from(value.trim(), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return (code < 32 && code !== 9) || code === 127 ? " " : character;
  })
    .join("")
    .slice(0, limit);
}

function parseEntry(line: string): ChatLogEntry[] {
  try {
    const entry = JSON.parse(line);
    if (
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>)["sender"] === "string" &&
      typeof (entry as Record<string, unknown>)["message"] === "string" &&
      typeof (entry as Record<string, unknown>)["timestamp"] === "string"
    ) {
      return [entry as ChatLogEntry];
    }
  } catch {
    // A bad log line should never stop the room from opening.
  }
  return [];
}
