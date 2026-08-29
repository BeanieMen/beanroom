import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { utils } from "ssh2";

import { ChatRoom } from "./chat/chatroom.js";
import { APP_CONFIG } from "./helpers/config.js";
import { logger } from "./helpers/logger.js";
import { createSshServer } from "./helpers/server.js";

const KEY_FILE = "ssh_host_ed25519_key";

function loadOrCreateHostKeys(): Buffer[] {
  if (!existsSync(KEY_FILE)) {
    logger.info(`[index] SSH host key "${KEY_FILE}" not found. Generating new Ed25519 key...`);
    const keyPair = utils.generateKeyPairSync("ed25519");
    writeFileSync(KEY_FILE, keyPair.private, { mode: 0o600 });
    writeFileSync(`${KEY_FILE}.pub`, keyPair.public, { mode: 0o644 });
    logger.info(`[index] Generated and saved host key to ${KEY_FILE}`);
  }
  return [readFileSync(KEY_FILE)];
}

const hostKeys = loadOrCreateHostKeys();

logger.info(`[index] creating ChatRoom`);
const chatRoom = new ChatRoom();
const server = createSshServer(hostKeys, chatRoom, logger);

server.on("error", (error: Error) => {
  logger.error(`[index] server error: ${String(error)}`);
});

server.listen(APP_CONFIG.port, APP_CONFIG.host, () => {
  logger.info(
    `SSH Server listening on ${APP_CONFIG.host}:${String(APP_CONFIG.port)} (channels=${chatRoom.listChannels().join(",")})...`,
  );
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
  void chatRoom.flushAll().finally(() => {
    process.exit(0);
  });
});
