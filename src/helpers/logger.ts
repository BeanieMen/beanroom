/* eslint-disable no-console */

function stamp(): string {
  return new Date().toISOString();
}

const debugEnv: string | undefined = process.env["DEBUG"];
const DEBUG = debugEnv === "1" || debugEnv === "true";

export const logger = {
  info(message: string): void {
    console.log(`[info] ${stamp()} ${message}`);
  },
  warn(message: string): void {
    console.warn(`[warn] ${stamp()} ${message}`);
  },
  error(message: string): void {
    console.error(`[error] ${stamp()} ${message}`);
  },
  debug(message: string): void {
    if (DEBUG) console.log(`[debug] ${stamp()} ${message}`);
  },
} as const;

export type Logger = typeof logger;
