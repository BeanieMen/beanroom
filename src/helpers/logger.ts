/* eslint-disable no-console */

function stamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info(message: string): void {
    console.log(`[info] ${stamp()} ${message}`);
  },
  warn(message: string): void {
    console.warn(`[warn] ${stamp()} ${message}`);
  },
} as const;

export type Logger = typeof logger;
