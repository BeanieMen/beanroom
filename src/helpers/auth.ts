import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";

import bcrypt from "bcryptjs";
import { z } from "zod";

import { APP_CONFIG } from "./config.js";

const DUMMY_HASH = bcrypt.hashSync("beanroom_login_timing_padding", 12);

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Username must be alphanumeric + underscore");
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(64, "Password must be at most 64 characters");

interface StoredUser {
  username: string;
  passwordHash: string;
  createdAt: string;
}

export class AuthService {
  private readonly attempts = new Map<string, { count: number; lastAttempt: number }>();

  async register(username: string, password: string): Promise<string> {
    const validUsername = usernameSchema.safeParse(username);
    if (!validUsername.success) return validUsername.error.issues[0]?.message ?? "Invalid username";
    const validPassword = passwordSchema.safeParse(password);
    if (!validPassword.success) return validPassword.error.issues[0]?.message ?? "Invalid password";

    const users = loadUsers();
    if (users.some((user) => user.username === validUsername.data))
      return "Username already taken.";
    users.push({
      username: validUsername.data,
      passwordHash: await bcrypt.hash(validPassword.data, 12),
      createdAt: new Date().toISOString(),
    });
    saveUsers(users);
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

    const stored = loadUsers().find((user) => user.username === validUsername.data);
    if (stored === undefined || !(await bcrypt.compare(validPassword.data, stored.passwordHash))) {
      this.recordAttempt(validUsername.data);
      return { message: "Invalid credentials." };
    }

    this.attempts.delete(validUsername.data);
    return { message: "Logged in successfully.", username: stored.username };
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
}

function usersPath(): string {
  return path.join(process.cwd(), "data", "users.json");
}

function loadUsers(): StoredUser[] {
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

function saveUsers(users: StoredUser[]): void {
  const directory = path.dirname(usersPath());
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  const file = usersPath();
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, JSON.stringify({ users }, null, 2), { mode: 0o600 });
  renameSync(temporary, file);
}
