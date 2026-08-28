export const APP_CONFIG = {
  host: "127.0.0.1",
  port: 2222,
  historyLimit: 10,
  maxMessageLength: 512,
  rateLimitWindowMs: 60_000,
  maxLoginAttempts: 5,
} as const;

export const UI_THEMES = {
  "tokyo-night": {
    label: "TOKYO NIGHT",
    background: "#1a1b26",
    foreground: "#c0caf5",
    border: "#7aa2f7",
    muted: "#565f89",
    accent: "#bb9af7",
    highlight: "#7dcfff",
    warm: "#e0af68",
    bannerGradient: ["#7aa2f7", "#bb9af7", "#7dcfff"] as const,
    bannerGradientReverse: ["#7dcfff", "#bb9af7", "#7aa2f7"] as const,
  },
  gruvbox: {
    label: "GRUVBOX",
    background: "#282828",
    foreground: "#ebdbb2",
    border: "#d79921",
    muted: "#928374",
    accent: "#d3869b",
    highlight: "#83a598",
    warm: "#fabd2f",
    bannerGradient: ["#fe8019", "#fabd2f", "#b8bb26"] as const,
    bannerGradientReverse: ["#b8bb26", "#fabd2f", "#fe8019"] as const,
  },
} as const;

export type UiThemeName = keyof typeof UI_THEMES;

export const DEFAULT_THEME: UiThemeName = "tokyo-night";
