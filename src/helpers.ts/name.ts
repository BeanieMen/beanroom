import { createHash } from "crypto";
import { type PublicKeyAuthContext, utils } from "ssh2";

/**
 * Generates a 5-digit numeric hash from the raw SSH public key buffer.
 * Returns a number between 10000 and 99999.
 */
export function get5DigitKeyHash(keyBuffer: Buffer): number {
  const hash = createHash("sha256").update(keyBuffer).digest();
  const numericHash = hash.readUInt32BE(0);
  return 10000 + (numericHash % 90000);
}

/**
 * Generates a name combining ctx.username and a 5-digit hash of the public key data.
 * Example result: "beanie_48192" or "root_10482"
 */
export function getCombinedUsername(
  username: string,
  keyData: Buffer
): string {
  const hashId = get5DigitKeyHash(keyData);
  const cleanUsername = username.trim() || "Guest";
  return `${cleanUsername}_${hashId}`;
}