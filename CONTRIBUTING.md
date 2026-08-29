# Contributing to BeanRoom

Thank you for your interest in contributing.

This document is intentionally detailed. It is designed so that even a first year student can understand how this project works and start contributing without needing to read the entire codebase.

You will still need to look at small parts of the code when making changes, but after reading this guide, you should understand how everything fits together and where to look.

---

## 1. What This Project Does

BeanRoom is basically an SSH server you can connect to via SSH anonymously (we don't save your personal data).
It is structured in channels with multiple people in channels interacting in real-time right inside their command-line terminal.

---

## 2. Tech Stack

- **Runtime & Package Manager:** Bun / Node.js
- **Language:** TypeScript
- **Core Libraries:**
  - `ssh2`: Low-level SSH server implementation
  - `zod`: Schema validation
  - `bcryptjs`: Secure password hashing
  - `gradient-string`: Color themes and rendering in terminal

---

## 3. File Structure Explained

You do not need to explore randomly. Here is exactly what each important file does.

### src/index.ts

This is the entry point.

It:

- reads host SSH keys (`ssh_host_ed25519_key`)
- initializes the global `ChatRoom` instance
- starts the SSH server listening on configured host/port
- handles graceful shutdown signals (`SIGINT`)

You usually do not need to modify this unless changing server lifecycle or listener logic.

---

### src/helpers/server.ts

Handles raw SSH connection lifecycle and session setup.

It:

- authenticates incoming SSH client connections
- sets up terminal dimensions (pty window resizing)
- attaches input/output streams to user sessions
- routes user input to the chat engine or command handler

---

### src/chat/chatroom.ts & src/chat/channel.ts

This is the core chat management system.

It handles:

- managing active channels (`#general`, etc.)
- routing messages between connected user sessions
- broadcast notifications (user join, leave, rename)
- session tracking and lifecycle cleanups

Most chat-related features will involve these files.

---

### src/commands/

This folder contains chat command handlers (e.g. `/join`, `/login`, `/register`, `/theme`, `/whoami`, `/help`).

It handles:

- `handler.ts`: Parses command lines starting with `/` and dispatches them to specific command implementations
- command files: execute actions like switching channels, registering users, or customizing terminal themes

You touch this if:

- adding a new Slash command
- changing behavior of existing commands

---

### src/helpers/terminal.ts

Handles terminal rendering and TUI display logic.

It handles:

- ANSI escape codes and terminal cursor management
- rendering chat messages, status bars, and input prompts
- terminal resizing recalculations

You touch this if:

- modifying terminal UI visuals
- fixing layout or rendering glitches

---

### src/types/

Contains shared TypeScript types.

Files:

- `session.ts`: Defines `UserSession` and active connection state
- `user.ts`: Defines user data profiles and authentication models
- `chat.ts`: Defines chat message payload structures

Safe to modify if:

- adding new structured fields to sessions, users, or messages

---

## 4. Understanding the Execution Flow Without Reading Everything

You do not need to read the whole codebase. Focus on these logical execution steps when an SSH connection comes in.

---

### Step 1: Accept SSH Connection

Client runs `ssh beanroom.server`. `src/helpers/server.ts` accepts connection and requests interactive shell.

---

### Step 2: Initialize Session

Generates an anonymous user identity (or authenticates an existing user), attaches renderer, and registers session in `src/chat/chatroom.ts`.

---

### Step 3: Join Channel

Adds user session to default channel (e.g. `#general`). Historical messages are streamed to client's terminal.

---

### Step 4: Handle User Input

Input stream is monitored:

- If input starts with `/`, it passes to `src/commands/handler.ts`.
- Otherwise, it is treated as a chat message and broadcasted via `src/chat/channel.ts`.

---

### Step 5: Render Output to Terminal

`src/helpers/terminal.ts` formats messages with theme colors/gradients and writes raw ANSI output back to client SSH shell stream.

---

### Step 6: Session Disconnect

When SSH connection drops, `ChatRoom` removes user session and notifies remaining users in the channel.

---

## 6. Safety & Privacy Model

This project is designed to be safe and privacy-friendly.

- Anonymous user data is transient (in-memory)
- Passwords for registered accounts are hashed securely with `bcrypt`
- SSH transport layer ensures encrypted communication
- Server handles stream errors cleanly without crashing host process

---

## 7. What Can Break the System

These are the most common failure points.

---

### 1. Breaking the Input/Output pipeline

If this flow breaks:

```
SSH input → Command/Chat Router → Broadcast → Terminal Renderer → SSH output
```

the terminal becomes non-responsive or hangs.

---

### 2. Invalid ANSI Escape Sequences

Incorrect terminal escape sequence formatting in `terminal.ts` can corrupt visual rendering in client terminals.

---

### 3. Session Leak / Dangling References

Failing to remove disconnected sessions from `ChatRoom` will lead to memory leaks and broadcasting to closed streams.

---

### 4. Unhandled Async Errors

Failing to catch stream errors or async database/storage operations can crash the SSH server process.

---

## 8. How to Contribute

---

### Step 1: Pick a small change

Examples:

- add a new simple command (e.g., `/ping` or `/roll`)
- fix a terminal display glitch
- improve error messages
- add type definitions or tests

---

### Step 2: Make focused changes

Do not modify multiple systems at once. Keep PRs small and targeted.

---

### Step 3: Test locally

Run type checking and linting before submitting:

```bash
bun run typecheck
bun run lint
```

---

### Step 4: Open Pull Request

Explain:

- what you changed
- why you changed it

---

## 9. Good First Contributions

- adding new slash commands (`src/commands/`)
- refining help messages and documentation
- cleaning up unused TypeScript types or code
- adding tests or helper utility validations

---

## 10. What to Avoid

- adding large complex features without initial discussion
- modifying core SSH authentication mechanics carelessly
- changing multiple core systems together
- pushing unformatted or failing TypeScript code

---

## 11. When You Are Unsure

Open an issue before making changes.

It is better to discuss than to break core behavior.

---

## Final Note

You do not need to understand the entire codebase to contribute.

Focus on:

- the session pipeline
- one component or command at a time

If you follow this guide, you should be able to contribute safely and confidently.
