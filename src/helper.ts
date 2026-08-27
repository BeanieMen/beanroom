import { type ServerChannel } from "ssh2";
import gradient from "gradient-string";
import { colors } from "./config";

export type ColorSupportLevel = 0 | 1 | 2 | 3;

/**
 * Positioned color stop for precise N-step control.
 * pos is a value between 0.0 and 1.0.
 */
export interface ColorStop {
  color: string;
  pos: number;
}

export type GradientInput = string[] | ColorStop[];

export interface RichWriteOptions {
  colorLevel?: ColorSupportLevel;

  /**
   * Accepts any N-step gradient configuration:
   * - N colors array:
   *   ["#ff0000", "#00ff00", "#0000ff", "#ffff00"]
   *
   * - N positioned stops:
   *   [
   *     { color: "red", pos: 0 },
   *     { color: "blue", pos: 0.8 },
   *     { color: "pink", pos: 1 }
   *   ]
   */
  gradient?: GradientInput;

  /**
   * Hex color (#RRGGBB) or ANSI escape sequence.
   */
  color?: string;
}

/**
 * Strips ANSI escape sequences from a string to get
 * true character counts / plain text.
 */
function stripAnsi(str: string): string {
  return str.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001b\u009b][\[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqr-uy]/g,
    "",
  );
}

/**
 * Converts a #RRGGBB hex color into RGB values.
 */
function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace(/^#/, "");

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

/**
 * Converts a color into the appropriate ANSI format
 * for the terminal's color support level.
 *
 * Level 0 = no color
 * Level 1 = 16 colors
 * Level 2 = 256 colors
 * Level 3 = 24-bit TrueColor
 */
function colorToAnsi(
  color: string,
  colorLevel: ColorSupportLevel,
): string {
  if (colorLevel === 0) {
    return "";
  }

  // Already an ANSI escape sequence.
  if (color.startsWith("\x1b[")) {
    return color;
  }

  // Hex color.
  if (color.startsWith("#")) {
    const [r, g, b] = hexToRgb(color);

    switch (colorLevel) {
      case 3:
        return `\x1b[38;2;${r};${g};${b}m`;

      case 2:
        return `\x1b[38;5;${rgbToAnsi256(r, g, b)}m`;

      case 1:
        return `\x1b[${rgbTo16(r, g, b)}m`;

      default:
        return "";
    }
  }

  // If it's something else, assume the caller already
  // provided a valid ANSI-compatible color sequence.
  return color;
}

/**
 * Process a text string through gradient-string supporting
 * N-steps & custom positioning.
 */
function processGradient(
  message: string,
  gradientInput: GradientInput,
  colorLevel: ColorSupportLevel,
): string {
  if (colorLevel === 0) {
    return stripAnsi(message);
  }

  const grad = gradient(gradientInput);

  // Level 3: Full TrueColor 24-bit output directly
  // from gradient-string.
  if (colorLevel === 3) {
    return grad(message);
  }

  // Level 1 & 2: Generate TrueColor first, then
  // downsample to the terminal's supported color mode.
  const truecolorOutput = grad(message);

  if (colorLevel === 2) {
    return downsampleTo256(truecolorOutput);
  }

  return downsampleTo16(truecolorOutput);
}

/**
 * Downsamples 24-bit TrueColor ANSI escape sequences
 * to 256-color ANSI.
 */
function downsampleTo256(ansiStr: string): string {
  return ansiStr.replace(
    /\x1b\[38;2;(\d+);(\d+);(\d+)m/g,
    (_, r, g, b) =>
      `\x1b[38;5;${rgbToAnsi256(
        Number(r),
        Number(g),
        Number(b),
      )}m`,
  );
}

/**
 * Downsamples 24-bit TrueColor ANSI escape sequences
 * to 16-color ANSI.
 */
function downsampleTo16(ansiStr: string): string {
  return ansiStr.replace(
    /\x1b\[38;2;(\d+);(\d+);(\d+)m/g,
    (_, r, g, b) =>
      `\x1b[${rgbTo16(
        Number(r),
        Number(g),
        Number(b),
      )}m`,
  );
}

/**
 * Converts RGB to the closest ANSI 256 color.
 */
function rgbToAnsi256(
  r: number,
  g: number,
  b: number,
): number {
  // Grayscale range.
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;

    return Math.round(((r - 8) / 247) * 24) + 232;
  }

  const r6 = Math.round((r / 255) * 5);
  const g6 = Math.round((g / 255) * 5);
  const b6 = Math.round((b / 255) * 5);

  return 16 + 36 * r6 + 6 * g6 + b6;
}

/**
 * Converts RGB to the closest ANSI 16 color.
 */
function rgbTo16(
  r: number,
  g: number,
  b: number,
): number {
  const bright =
    r > 128 || g > 128 || b > 128
      ? 60
      : 0;

  let code = 30;

  if (r > 64) code += 1;
  if (g > 64) code += 2;
  if (b > 64) code += 4;

  return code + bright;
}

export function RichWriteLine(
  shell: ServerChannel,
  message: string,
  options: RichWriteOptions = {},
) {
  const {
    colorLevel = 1,
    gradient: gradientInput,
    color,
  } = options;

  if (colorLevel === 0) {
    shell.write(`${stripAnsi(message)}\r\n`);
    return;
  }

  if (
    gradientInput &&
    gradientInput.length > 0 &&
    message.length > 0
  ) {
    const output = processGradient(
      message,
      gradientInput,
      colorLevel,
    );

    shell.write(
      `${output}${colors.reset}\r\n`,
    );

    return;
  }

  const fallbackColor = colorToAnsi(
    color ?? colors.white,
    colorLevel,
  );

  shell.write(
    `${fallbackColor}${message}${colors.reset}\r\n`,
  );
}

export function RichWrite(
  shell: ServerChannel,
  message: string,
  options: RichWriteOptions = {},
) {
  const {
    colorLevel = 1,
    gradient: gradientInput,
    color,
  } = options;

  if (colorLevel === 0) {
    shell.write(stripAnsi(message));
    return;
  }

  if (
    gradientInput &&
    gradientInput.length > 0 &&
    message.length > 0
  ) {
    const output = processGradient(
      message,
      gradientInput,
      colorLevel,
    );

    shell.write(
      `${output}${colors.reset}`,
    );

    return;
  }

  const fallbackColor = colorToAnsi(
    color ?? colors.white,
    colorLevel,
  );

  shell.write(
    `${fallbackColor}${message}${colors.reset}`,
  );
}

/**
 * Infers color capability level (0 to 3)
 * from an SSH PTY `term` string.
 *
 * Level 0 = No color
 * Level 1 = 16 colors
 * Level 2 = 256 colors
 * Level 3 = TrueColor
 */
export function getTerminalColorSupport(
  termString?: string,
): ColorSupportLevel {
  if (!termString) {
    return 1;
  }

  const term = termString
    .toLowerCase()
    .trim();

  if (
    term === "dumb" ||
    term === "raw" ||
    term === "unknown"
  ) {
    return 0;
  }

  const truecolorTerms = [
    "kitty",
    "xterm-kitty",
    "ghostty",
    "foot",
    "alacritty",
    "wezterm",
    "rio",
    "warp",
  ];

  if (
    truecolorTerms.some((t) =>
      term.includes(t),
    ) ||
    term.endsWith("-direct") ||
    term.endsWith("-truecolor") ||
    term.endsWith("-24bit")
  ) {
    return 3;
  }

  if (
    term.includes("256color") ||
    term.includes("256-color") ||
    term.includes("256") ||
    term.startsWith("tmux") ||
    term.startsWith("screen")
  ) {
    return 2;
  }

  return 1;
}

/**
 * Generates two related colors for a username.
 */
export function getUsernameColor(
  username: string,
): [string, string] {
  let hash = 0;

  for (let i = 0; i < username.length; i++) {
    hash =
      (hash * 31 +
        username.charCodeAt(i)) |
      0;
  }

  const hue = (hash >>> 0) % 360;
  const hue2 = (hue + 30) % 360;

  return [
    hslToHex(hue, 75, 50),
    hslToHex(hue2, 70, 60),
  ];
}

/**
 * Converts HSL to #RRGGBB.
 */
function hslToHex(
  h: number,
  s: number,
  l: number,
): string {
  s /= 100;
  l /= 100;

  const k = (n: number) =>
    (n + h / 30) % 12;

  const a =
    s * Math.min(l, 1 - l);

  const f = (n: number) =>
    l -
    a *
      Math.max(
        -1,
        Math.min(
          k(n) - 3,
          Math.min(9 - k(n), 1),
        ),
      );

  return (
    "#" +
    [f(0), f(8), f(4)]
      .map((x) =>
        Math.round(255 * x)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
