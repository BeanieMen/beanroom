import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";

import bcrypt from "bcryptjs";
import { z } from "zod";

import { AsyncMutex } from "../chat/async-util.js";

import { APP_CONFIG } from "./config.js";

const DUMMY_HASH = bcrypt.hashSync("beanroom_login_timing_padding", 12);

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Username must be alphanumeric + underscore")
  .refine(
    (val) => !val.toLowerCase().startsWith("guest"),
    "Usernames starting with 'guest' are reserved for unauthenticated sessions.",
  );
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(64, "Password must be at most 64 characters");

interface StoredUser {
  username: string;
  passwordHash: string;
  createdAt: string;
  colorPreference?: [string, string];
}

export class AuthService {
  private readonly attempts = new Map<string, { count: number; lastAttempt: number }>();
  private cachedUsers: StoredUser[] | null = null;
  private readonly writeMutex = new AsyncMutex();
  async register(username: string, password: string): Promise<string> {
    const validUsername = usernameSchema.safeParse(username);
    if (!validUsername.success) return validUsername.error.issues[0]?.message ?? "Invalid username";
    const validPassword = passwordSchema.safeParse(password);
    if (!validPassword.success) return validPassword.error.issues[0]?.message ?? "Invalid password";

    const users = this.loadUsers();
    if (users.some((user) => user.username === validUsername.data))
      return "Username already taken.";
    users.push({
      username: validUsername.data,
      passwordHash: await bcrypt.hash(validPassword.data, 12),
      createdAt: new Date().toISOString(),
    });
    await this.saveUsers(users);
    return `User ${validUsername.data} registered successfully.`;
  }

  async login(username: string, password: string): Promise<{ message: string; username?: string }> {
    const cleanUsername = username.trim();
    if (this.isRateLimited(cleanUsername))
      return { message: "Too many attempts. Try again later." };

    const validUsername = usernameSchema.safeParse(cleanUsername);
    const validPassword = passwordSchema.safeParse(password);
    if (!validUsername.success || !validPassword.success) {
      await bcrypt.compare(password, DUMMY_HASH);
      this.recordAttempt(cleanUsername);
      return { message: "Invalid credentials." };
    }

    const stored = this.loadUsers().find((user) => user.username === validUsername.data);
    if (stored === undefined || !(await bcrypt.compare(validPassword.data, stored.passwordHash))) {
      this.recordAttempt(validUsername.data);
      return { message: "Invalid credentials." };
    }

    this.attempts.delete(validUsername.data);
    return { message: "Logged in successfully.", username: stored.username };
  }

  /** Saved color preference for a logged-in user, if any. */
  getColorPreference(username: string): [string, string] | undefined {
    return this.loadUsers().find((user) => user.username === username)?.colorPreference;
  }

  /** Persist a color preference for a logged-in user. */
  async setColorPreference(username: string, gradient: [string, string]): Promise<void> {
    const users = this.loadUsers();
    const user = users.find((u) => u.username === username);
    if (user === undefined) return;
    user.colorPreference = gradient;
    await this.saveUsers(users);
  }

  private isRateLimited(username: string): boolean {
    const entry = this.attempts.get(username);
    if (entry === undefined) return false;
    if (Date.now() - entry.lastAttempt >= APP_CONFIG.rateLimitWindowMs) {
      this.attempts.delete(username);
      return false;
    }
    return entry.count >= APP_CONFIG.maxLoginAttempts;
  }

  private recordAttempt(username: string): void {
    const previous = this.attempts.get(username);
    this.attempts.set(username, {
      count: (previous?.count ?? 0) + 1,
      lastAttempt: Date.now(),
    });
  }

  private loadUsers(): StoredUser[] {
    if (this.cachedUsers !== null) return this.cachedUsers;
    this.cachedUsers = readUsers();
    return this.cachedUsers;
  }

  private async saveUsers(users: StoredUser[]): Promise<void> {
    this.cachedUsers = users;
    await this.writeMutex.run(() => {
      writeUsers(users);
    });
  }
}

/**
 * Shared singleton so all command modules read/write the same in-memory cache.
 * Multiple instances would each hold a stale copy of the user list, so color
 * preferences set by one module would be invisible to login lookups in another.
 */
export const authService = new AuthService();

function usersPath(): string {
  return path.join(process.cwd(), "data", "users.json");
}

function readUsers(): StoredUser[] {
  const file = usersPath();
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as { users?: unknown }).users)
    )
      return [];
    return (parsed as { users: StoredUser[] }).users;
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]): void {
  const directory = path.dirname(usersPath());
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  const file = usersPath();
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, JSON.stringify({ users }, null, 2), { mode: 0o600 });
  renameSync(temporary, file);
}
