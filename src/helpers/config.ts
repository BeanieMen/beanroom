export const APP_CONFIG = {
  host: "127.0.0.1",
  port: 2222,
  historyLimit: 10,
  maxMessageLength: 512,
  rateLimitWindowMs: 60_000,
  maxLoginAttempts: 5,
} as const;

export const THEME = {
  bannerGradient: ["#ff007f", "#9d00ff", "#00f0ff"] as const,
  bannerGradientReverse: ["#00f0ff", "#9d00ff", "#ff007f"] as const,
  welcomeColor: "#5b9fff",
  systemColor: "\x1b[90m",
  white: "\x1b[97m",
  reset: "\x1b[0m",
} as const;
