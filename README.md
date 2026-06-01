# Vis

An alternative web UI for [OpenCode](https://github.com/sst/opencode), designed for daily use. It connects to a running OpenCode instance and provides a browser-based, window-style interface for managing sessions, viewing tool output, and interacting with AI agents in real time.

![Demo](docs/demo.gif)

## Features

- **Review-first floating windows** that keep tool output and agent reasoning in context
- Session management with **multi-project and worktree** support
- Syntax-highlighted **code and diff viewers** built for fast, confident review
- Permission and question prompts for interactive agent workflows
- Embedded terminal powered by xterm.js

## How to Use

### Cloud

**No installation required** — just open the hosted version in your browser:

**<https://sebbejohansson.github.io/opencode-vis/>**

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

### Local

The hosted version connects to your local OpenCode server, which some browsers may block due to security restrictions.
If this happens, you can serve the UI locally instead:

Start the UI server:

```bash
npx opencode-vis
```

Start the OpenCode API server:

```bash
opencode serve
```

Then open `http://localhost:3000` in your browser.

---

## Development

```sh
bun install
bun dev
```

## License

MIT — see [LICENSE](./LICENSE) for details.

## Origins

This project originated as a fork of [xenodrive/vis](https://github.com/xenodrive/vis). It was separated from the fork network because the original project saw no continued development, and this version has since deviated significantly in both features and architecture.
