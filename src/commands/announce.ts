import { reply } from "./output.js";

import type { UserSession } from "../types/session.js";

export default async function command(session: UserSession, args: string[]): Promise<void> {
  await Promise.resolve();
  const text = args.join(" ").trim();
  if (text.length === 0) {
    session.renderer.showPopup(session, {
      title: "#announcements",
      author: session.user.name,
      timeAgo: "just now",
      lines: [
        "HEY!!~, You there. Yes you i am talking to you be nice. thats the first rule and just be a good human being",
        "",
        "this is an le anon chatroom or wtv you can do anything. this is being actively developed on. down below is just some useful stuff you should know",
        "list help about /list",
        "/login",
        "/register",
        " and other stuff ",
        "",
        "do /register it takes like 2 mins",
      ],
      controlsHint: "Enter continue  Esc/q close",
    });
    return;
  }

  session.chatRoom.broadcastPopup({
    title: "#announcements",
    author: session.user.name,
    timeAgo: "just now",
    lines: [text],
    controlsHint: "Enter continue  Esc/q close",
  });
  reply(session, "Broadcast announcement popup to all users.");
}
