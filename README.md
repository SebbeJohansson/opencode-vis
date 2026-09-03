<div align="center">
  
  # openui
  
  ![License](https://img.shields.io/badge/license-MIT-green)

A web UI for [OpenCode](https://github.com/sst/opencode) and [Claude Code CLI](https://github.com/anthropics/claude-code), designed for daily use. It connects to a running OpenCode instance and/or the Claude Code CLI and provides a browser-based, window-style interface for managing sessions, viewing tool output, and interacting with AI agents in real time.

  <img src="docs/demo.gif" alt="Demo" width="800" />

Live demo: [https://sebbejohansson.github.io/openui/](https://sebbejohansson.github.io/openui/)

<div>

_previously known as opencode-vis_

</div>

</div>

---

## Features

- **Review-first floating windows** that keep tool output and agent reasoning in context
- **Trajectory view** flattens the whole session into one chronological stream (system prompts, user turns, context injections, reasoning, tool calls and results, subagents) with a lane timeline, per-record payload/result/timing inspection, search, and JSON export
- Session management with **multi-project and worktree** support, plus a searchable, sorted **sessions modal**
- **Customizable themes** with a built-in theme selector and support for your own custom themes
- **Model picker** with clear provider/model info, the ability to **hide models** you don't use, and **per-agent model memory** that remembers your choice for each agent
- Syntax-highlighted **code and diff viewers** built for fast, confident review
- Permission and question prompts for interactive agent workflows
- **Responsive mobile view** for reviewing sessions on the go
- **Notification sounds** (peon ping stream support) to stay aware of agent activity
- Robust **error handling** and cross-platform support (including Windows file trees)
- Embedded terminal powered by xterm.js
- Support for **Github Copilot Auto Mode** with the plugin <a href="https://github.com/m0wer/opencode-github-copilot-auto-model">opencode-github-copilot-auto-model</a>

#### Experimental Features

- **Claude Code CLI support** served by the built-in API. See OpenCode and Claude Code sessions side by side in the same UI

## Showcase

### Trajectory view

See what the agent did, and when it happened.

<p>
  <img src="docs/showcase/trajectory.png" alt="Trajectory" width="800" />
</p>

### Theme selector & custom themes

Pick from a range of built-in themes or craft your own custom theme to make the UI your own.

<p>
  <img src="docs/showcase/theme-selector.png" alt="Theme selector" width="400" />
  <img src="docs/showcase/custom-themes.png" alt="Custom themes" width="400" />
</p>

### Model selector & hiding models

Quickly switch between models and hide the ones you never use to keep the picker focused.

<p>
  <img src="docs/showcase/model-selector.png" alt="Model selector" width="400" />
  <img src="docs/showcase/hidden-models.png" alt="Hidden models" width="400" />
</p>

## How to Use

### Cloud

**No installation required** - just open the hosted version in your browser:

**<https://sebbejohansson.github.io/openui/>**

All you need is a running OpenCode server with CORS enabled. Start it with:

```bash
opencode serve --cors https://sebbejohansson.github.io
```

Or add this to your `.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "server": {
    "cors": ["https://sebbejohansson.github.io"]
  }
}
```

and then:

```bash
opencode serve
```

### Local (OpenCode only)

The hosted version connects to your local OpenCode server, which some browsers may block due to security restrictions.
If this happens, you can serve the UI locally instead:

Start the UI server:

```bash
npx openui
```

Start the OpenCode API server:

```bash
opencode serve
```

Then open `http://localhost:3000` in your browser.

---

### Local (OpenCode + Claude Code)

The server can also run Claude Code CLI sessions. Both kinds appear in the same
session dropdown, and you can run them side by side.

**Requirements:**

- OpenCode running on its default port (4096, or set `OPENCODE_URL`)
- Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)
- Node.js 22+

**Development:**

```bash
EXPERIMENTAL_CLAUDE=true OPENCODE_URL=http://localhost:4096 yarn dev
```

**Production:**

```bash
yarn build
EXPERIMENTAL_CLAUDE=true OPENCODE_URL=http://localhost:4096 yarn start
```

**What you get:**

- All your OpenCode sessions appear as normal
- All your Claude Code sessions from `~/.claude/projects/` appear in the same list, with full conversation history
- Creating a new Claude Code session: use the "New Claude session" item in the session menu
- Resuming an old Claude Code session: just select it. History is replayed from disk, and `claude --resume` is called automatically when you send the first prompt

**Environment variables:**

| Variable              | Default     | Description                                                           |
| --------------------- | ----------- | --------------------------------------------------------------------- |
| `EXPERIMENTAL_CLAUDE` | `false`     | Opt in to Claude Code CLI support and expose the `/api/claude` routes |
| `OPENCODE_URL`        | unset       | URL of the running OpenCode server. When unset, the UI asks for it    |
| `VIS_PORT` / `PORT`   | `3000`      | Port to listen on (`--port` also works)                               |
| `NUXT_CLAUDE_BIN`     | auto-detect | Path to the `claude` binary                                           |

The `NUXT_`-prefixed names (`NUXT_OPENCODE_URL`, `NUXT_CLAUDE_ENABLED`,
`NUXT_CLAUDE_BIN`) work too, and are what a `.env` file should use.

---

## Architecture

```
Browser (Nuxt 4 SPA)
        |
        |  HTTP + SSE, same origin
        v
Nitro server  server/
        |-- GET /api/config              -> which OpenCode server to use, is Claude enabled
        |-- /api/claude/**               -> Claude Code sessions
        |                                   (one `claude` subprocess per session)
        v
Browser also talks directly to the OpenCode server (port 4096) over HTTP + SSE
```

The server translates Claude Code's `stream-json` output into the same SSE
envelope the app already uses for OpenCode, so the UI does not care which
backend owns a session; it sees one flat list of projects and sessions.

**Layout:**

| Path             | Purpose                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `app/`           | The SPA. `pages/index.vue` is the only route; `components/shell/` is the app shell; `composables/` holds one composable per feature |
| `server/`        | Nitro routes (`api/config`, `api/claude/**`) and the Claude subprocess code in `server/utils/claude/`                               |
| `shared/`        | Types and id helpers used by both sides                                                                                             |
| `bin/openui.mjs` | The published launcher; starts the built Nitro server                                                                               |

---

## Development

```sh
yarn install
yarn dev
```

Useful scripts:

| Script          | What it does                                                   |
| --------------- | -------------------------------------------------------------- |
| `yarn dev`      | Nuxt dev server, API included                                  |
| `yarn check`    | Lint, format check, typecheck and tests                        |
| `yarn build`    | Build the Nitro server (what npm ships)                        |
| `yarn generate` | Build the static site (`NUXT_APP_BASE_URL=/openui/` for Pages) |
| `yarn test`     | Vitest                                                         |

Node 22+ is required. See [AGENTS.md](./AGENTS.md) for conventions and gotchas.

## Support the project

<div>
  <ul>
    <li>⭐ the repo</li>
    <li><a href="https://github.com/SebbeJohansson/openui/issues">Help us improve</a></li>
  </ul>
  <div>
    <a href="https://www.buymeacoffee.com/sebbejohansson"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20Monster&emoji=%F0%9F%90%89&slug=sebbejohansson&button_colour=000000&font_colour=48e704&font_family=Bree&outline_colour=48e704&coffee_colour=48e704" height="40px"/></a>
  </div>
  <br>
</div>

## License

MIT - see [LICENSE](./LICENSE) for details.

## Origins

This project originated as a fork of [xenodrive/vis](https://github.com/xenodrive/vis). It was separated from the fork network because the original project saw no continued development, and this version has since deviated significantly in both features and architecture.
