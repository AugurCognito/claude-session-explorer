# claude-session-explorer

Fast, structured access to your Claude Code session history. Search conversations, track token usage, extract file operations, and export sessions — all from the terminal.

Reads directly from `~/.claude/` with zero setup. JSON output by default, pipe-friendly.

## Install

```bash
npm i -g claude-session-explorer
```

[![npm](https://img.shields.io/npm/v/claude-session-explorer)](https://www.npmjs.com/package/claude-session-explorer)

### From source

```bash
pnpm install
pnpm build
pnpm link --global
```

## Usage

```bash
cse list                          # all sessions, most recent first
cse list --today --pretty         # today's sessions as a table
cse list --project /path/to/dir   # filter by project
cse show <session-id>             # session metadata
cse show <session-id> --raw       # raw JSONL lines
cse search "authentication"       # search user messages
cse search "auth" --all --regex   # search everything with regex
cse stats                         # aggregate statistics
cse projects --pretty             # list all projects
cse history --search "deploy"     # search prompt history
cse files <session-id>            # file operations (read/write/edit)
cse messages <session-id> --user  # extract user messages
cse tokens <session-id>           # per-turn token usage
cse export <session-id> --format md  # export as markdown
```

## Commands

| Command | Description |
|---|---|
| `list` | List sessions with filters (project, date, kind, entrypoint) |
| `show` | Show session detail, messages, tools, files, tokens |
| `search` | Full-text search across sessions (substring or regex) |
| `stats` | Aggregate statistics (counts, breakdowns by project/hour) |
| `projects` | List all projects with session counts |
| `history` | Prompt history from history.jsonl |
| `files` | Extract file operations from a session |
| `messages` | Extract messages with filters (user/assistant, slice, first/last) |
| `tokens` | Per-turn token usage breakdown |
| `export` | Export session data to JSON or Markdown |

## Global Flags

```
--claude-dir <path>    Override ~/.claude location
--json                 JSON output (default)
--pretty               Human-readable table output
--verbose              Debug info to stderr
```

## Development

```bash
pnpm dev -- list --pretty --today   # run without building
pnpm check                          # biome lint + typecheck
pnpm lint:fix                       # auto-fix lint/format issues
pnpm build                          # build to dist/
```

## Design

- **JSON-first** — `--json` default, `--pretty` for humans
- **Composable** — each command does one thing, pipe the rest
- **Fast** — stream-parses JSONL, no database needed
- **Read-only** — never modifies session data
