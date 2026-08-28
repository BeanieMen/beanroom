import { existsSync, readFileSync, renameSync, statSync } from "node:fs";
import { appendFile } from "node:fs/promises";

import { APP_CONFIG } from "../helpers/config.js";

import { CoalescingBatch } from "./async-util.js";

import type { ChatLogEntry } from "../types/chat.js";

const MAX_LOG_BYTES = 10 * 1024 * 1024;

/**
 * Append-only, per-channel history.
 *
 * Hot-path reads come from an in-memory cache, and writes are coalesced into a
 * single async file append per debounce window. This keeps chat I/O off the
 * event loop: `recent()` is a pure memory slice and `append()` only queues a
 * line, so 100 users across 10 channels never block on disk.
 */
export class HistoryService {
  private readonly entries: ChatLogEntry[] = [];
  private loaded = false;
  private readonly writer: CoalescingBatch;

  constructor(private readonly file = "chatlog.txt") {
    this.writer = new CoalescingBatch((lines) => this.writeLines(lines));
  }

  append(entry: ChatLogEntry): void {
    this.ensureLoaded();
    const safeEntry: ChatLogEntry = {
      sender: clean(entry.sender, 64),
      message: clean(entry.message, APP_CONFIG.maxMessageLength),
      timestamp: entry.timestamp,
    };
    this.entries.push(safeEntry);
    this.writer.push(JSON.stringify(safeEntry));
  }

  recent(limit: number): ChatLogEntry[] {
    this.ensureLoaded();
    return this.entries.slice(-limit);
  }

  /** Flush any pending writes to disk. Mostly useful at shutdown. */
  async flush(): Promise<void> {
    await this.writer.drain();
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.entries.push(...parseFile(this.file));
  }

  private async writeLines(lines: string[]): Promise<void> {
    if (lines.length === 0) return;
    rotateIfNeeded(this.file);
    await appendFile(this.file, `${lines.join("\n")}\n`, "utf8");
  }
}

function parseFile(file: string): ChatLogEntry[] {
  try {
    if (!existsSync(file)) return [];
    const raw = readFileSync(file, "utf8").trim();
    if (raw.length === 0) return [];
    return raw.split("\n").flatMap((line) => parseEntry(line));
  } catch {
    return [];
  }
}

function rotateIfNeeded(file: string): void {
  try {
    if (!existsSync(file) || statSync(file).size <= MAX_LOG_BYTES) return;
    renameSync(file, `${file}.old`);
  } catch {
    // If rotation fails the append will still succeed; leave the log as-is.
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
