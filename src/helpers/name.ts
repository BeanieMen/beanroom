import { createHash } from "node:crypto";

export function getCombinedUsername(username: string, keyData: Buffer): string {
  const raw = username
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 16);
  const requestedName = raw.length > 0 ? raw : "guest";
  const keyId = createHash("sha256").update(keyData).digest("hex").slice(0, 4);

  // Registered usernames can only contain letters, numbers, and underscores.
  // The reserved 'guest:' prefix keeps guest identities in their own namespace,
  // while the key fingerprint makes them stable and collision-free.
  return `guest:${requestedName}@${keyId}`;
}
