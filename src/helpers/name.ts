import { createHash } from "crypto";

export function getCombinedUsername(username: string, keyData: Buffer): string {
  const hash = createHash("sha256").update(keyData).digest();
  const keyId = 10000 + (hash.readUInt32BE(0) % 90000);
  return `${username.trim() || "Guest"}_${String(keyId)}`;
}
