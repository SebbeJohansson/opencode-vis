<div align="center">
  
  # openui
  
  ![License](https://img.shields.io/badge/license-MIT-green) 
<a href="https://visitor-badge.laobi.icu" title="Go to Source">
  <picture>
      <img src="https://visitor-badge.laobi.icu/badge?page_id=sebbejohansson.openui" />
  </picture>
</a>

A web UI for [OpenCode](https://github.com/sst/opencode) and [Claude Code CLI](https://github.com/anthropics/claude-code), designed for daily use. It connects to a running OpenCode instance and/or the Claude Code CLI and provides a browser-based, window-style interface for managing sessions, viewing tool output, and interacting with AI agents in real time.

  <img src="docs/demo.gif" alt="Demo" width="800" />

Live demo: [https://sebbejohansson.github.io/openui/](https://sebbejohansson.github.io/openui/)

<div>

*previously known as opencode-vis*

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
- **Claude Code CLI support** via the unified proxy. See OpenCode and Claude Code sessions side by side in the same UI

## Showcase

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

### Local (OpenCode + Claude Code — unified proxy)

The unified proxy runs alongside OpenCode and adds Claude Code CLI sessions to the same UI. Both appear in the same session dropdown — you can run them simultaneously and switch between them seamlessly.

**Requirements:**
- OpenCode running on its default port (4096, or set `OPENCODE_URL` if different)
- Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)
- Node.js 18+

**Single command (dev mode — spawns Vite automatically):**

```bash
EXPERIMENTAL_CLAUDE=true OPENCODE_URL=http://localhost:4096 yarn dev:full
```

**Or for production (serves pre-built `dist/`):**

```bash
yarn build
EXPERIMENTAL_CLAUDE=true OPENCODE_URL=http://localhost:4096 yarn dev:full:prod
```

**What you get:**
- All your OpenCode sessions appear as normal
- All your Claude Code sessions from `~/.claude/projects/` appear in the same list, with full conversation history
- Creating a new Claude Code session: send a `POST /session` with `{ "_source": "claude", "directory": "/path/to/project" }` (UI button coming soon)
- Resuming an old Claude Code session: just select it — history is replayed from disk, and `claude --resume` is called automatically when you send the first prompt

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `EXPERIMENTAL_CLAUDE` | `false` | Opt in to Claude Code CLI support and expose the Claude routes in the unified proxy |
| `CLAUDE_PROXY_PORT` | `4600` | Port the unified proxy listens on |
| `OPENCODE_URL` | `http://localhost:4096` | URL of the running OpenCode server |

---

## Architecture

```
Browser (openui Vue SPA)
        │
        │  HTTP + SSE
        ▼
Unified proxy  server-claude/index.ts  (port 4600)
        ├── forwards OpenCode calls ──────────────► OpenCode server (port 4096)
        └── manages Claude Code sessions ─────────► claude subprocess(es)
                                                     (one per active session)
```

The proxy translates Claude Code's `stream-json` stdout events into the OpenCode SSE envelope format the Vue app already understands. The Vue app has no knowledge of which backend owns a given session — it just sees a flat list of projects and sessions.

**`server-claude/` files:**

| File | Purpose |
|---|---|
| `index.ts` | Hono HTTP server, route handling, SSE fan-out |
| `storage.ts` | Reads `~/.claude/projects/` — enumerates projects and sessions from JSONL files |
| `sessions.ts` | Subprocess lifecycle — spawn, resume, write prompts, handle permission requests |
| `translator.ts` | Converts Claude stream-json events → OpenCode SSE shapes |
| `types.ts` | TypeScript types for Claude's wire protocol and stored JSONL format |

---

## Development

```sh
yarn install
yarn dev
```

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
