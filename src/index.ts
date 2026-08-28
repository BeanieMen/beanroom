import { readFileSync } from "fs";

import { ChatRoom } from "./chat/chatroom.js";
import { HistoryService } from "./chat/history.js";
import { APP_CONFIG } from "./helpers/config.js";
import { logger } from "./helpers/logger.js";
import { createSshServer } from "./helpers/server.js";

const hostKeys = [readFileSync("ssh_host_ed25519_key")];

const history = new HistoryService("chatlog.txt");
const chatRoom = new ChatRoom(history);
const server = createSshServer(hostKeys, chatRoom, logger);

server.listen(APP_CONFIG.port, APP_CONFIG.host, () => {
  logger.info(`SSH Server listening on ${APP_CONFIG.host}:${String(APP_CONFIG.port)}...`);
});

process.on("SIGINT", () => {
  logger.info("Shutting down");
  server.close();
  for (const sess of chatRoom.all()) {
    try {
      sess.renderer.close(sess.shell);
    } catch {
      // empty catch block
    }
    try {
      sess.shell.end();
    } catch {
      // empty catch block
    }
  }
  process.exit(0);
});
