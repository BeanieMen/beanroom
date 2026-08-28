import type { ColorSupportLevel } from "./chat.js";
import type { User } from "./user.js";
import type { ChatRoomChannel } from "../chat/channel.js";
import type { ChatRoom } from "../chat/chatroom.js";
import type { UiThemeName } from "../helpers/config.js";
import type { TerminalRenderer } from "../helpers/terminal.js";
import type { Connection, ServerChannel } from "ssh2";
export interface PopupModal {
  title: string;
  author?: string;
  timeAgo?: string;
  lines: string[];
  controlsHint?: string;
  onClose?: () => void;
}

export interface UserSession {
  id: string;
  client: Connection;
  shell: ServerChannel;
  user: User;
  colorLevel: ColorSupportLevel;
  usernameGradient: [string, string];
  theme: UiThemeName;
  joinedAt: Date;
  term: { rows: number; cols: number };
  inputBuffer: string;
  channelList: { selected: number } | null;
  activePopup: PopupModal | null;
  renderer: TerminalRenderer;
  chatRoom: ChatRoom;
  currentChannel: ChatRoomChannel | null;
}
