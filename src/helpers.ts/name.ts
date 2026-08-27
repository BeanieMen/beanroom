import { createHash } from "crypto";
import { utils, type PublicKeyAuthContext } from "ssh2";

/**
 * Generates a deterministic 4-digit guest number based strictly on key binary data.
 * The same public key will always output the same Guest number (e.g. Guest_8392).
 */
export function getGuestIdFromKey(keyBuffer: Buffer): string {
  // Hash key data using SHA-256
  const hash = createHash("sha256").update(keyBuffer).digest();
  
  // Read first 4 bytes as an unsigned 32-bit integer
  const numericHash = hash.readUInt32BE(0);
  
  // Modulo to get a deterministic 4-digit integer (1000 - 9999)
  const guestNum = 1000 + (numericHash % 9000);
  
  return `Guest_${guestNum}`;
}

/**
 * Safely extracts hostname/comment from an SSH public key,
 * falling back to a deterministic guest ID derived directly from key data.
 */
export function getMachineNameFromKeyContext(
  ctxKey: PublicKeyAuthContext["key"],
): string {
  try {
    const parsedKey = utils.parseKey(ctxKey.data);

    // Type-guard: verify parsedKey is NOT an Error and NOT an array
    if (parsedKey && !(parsedKey instanceof Error) && !Array.isArray(parsedKey)) {
      const comment = (parsedKey as { comment?: string }).comment?.trim();

      if (comment && comment.length > 0) {
        if (comment.includes("@")) {
          return comment.split("@").pop() || comment;
        }
        return comment;
      }
    }
  } catch {
    // Parsing failed
  }

  // Fallback: Calculate deterministic guest ID directly from the raw key buffer
  return getGuestIdFromKey(ctxKey.data);
}