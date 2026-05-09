---
name: claude-session-manager
description: This skill should be used when the user asks "what did I work on today?", "give me a standup summary", "what's the history of this project?", "which files keep getting edited?", "how was this error fixed before?", "why was this built this way?", "what loose ends are there?", "how much am I spending on Claude?", "what tools does Claude use most?", "export this session", "give me a weekly report", "find every time we discussed X", "what are my working patterns?", or mentions session history, token usage, file hotspots, decision archaeology, or unfinished work detection.
version: 0.1.0
---

# Claude Session Manager

Explore and analyze Claude Code session history using `cse` (claude-session-explorer).

## Prerequisites

`cse` must be installed globally:
```bash
npm i -g claude-session-explorer
```

Verify: run `cse list --today --pretty --stdout` via Bash.

## Core Principle

1. **QUERY** — run `cse` commands via Bash to extract raw JSON
2. **COLLECT** — gather results from multiple commands
3. **REASON** — apply judgment to the data
4. **RESPOND** — present findings to the user

Always pass `--stdout` so output goes to stdout. All commands default to JSON output.

## Commands

| Command | Purpose |
|---|---|
| `cse list` | List sessions with filters (project, date, kind) |
| `cse show <id>` | Session summary, or drill into --messages/--tools/--files/--tokens |
| `cse search "<query>"` | Full-text search across all sessions |
| `cse stats` | Aggregate statistics with tool/project/hour breakdown |
| `cse projects` | List all projects with session counts and token totals |
| `cse history` | Prompt history from history.jsonl |
| `cse files <id>` | File operations (read/write/edit) from a session |
| `cse messages <id>` | Extract messages with role/slice filters |
| `cse tokens [id]` | Per-turn or aggregated token usage |
| `cse export <id>` | Export session as JSON, Markdown, or CSV |

## Flags Reference

### Global
- `--claude-dir <path>` — override ~/.claude location
- `--stdout` — write to stdout (always use this)
- `--json` — JSON output (default)
- `--pretty` — human-readable table
- `--verbose` — debug info to stderr

### list
- `--project <path>` — filter by project directory
- `--today` / `--yesterday` / `--this-week` — date shorthands
- `--since <date>` / `--until <date>` — custom date range
- `--kind <kind>` — filter by session kind
- `--entrypoint <ep>` — filter by cli/ide/web
- `--limit <n>` — max results (default 50)
- `--sort <field>` — date (default) or duration
- `--reverse` — reverse sort order
- Output includes: id, title, date, project, duration, kind, entrypoint

### show
Default: session summary (title, model, duration, message counts, token totals)
- `--messages` — all messages with type, timestamp, content length, preview
- `--tools` — all tool_use blocks with name, input preview
- `--files` — file paths from Read/Write/Edit tool calls
- `--tokens` — per-turn token usage with model
- `--raw` — raw JSONL lines

### search
- `--all` — search both user + assistant content (default: user only)
- `--tools` — include tool_use inputs in search
- `--project <path>` — scope to project
- `--context <n>` — include N surrounding messages around each match
- `--regex` — treat query as regex
- `--since <date>` — filter by date
- Search is case-insensitive by default

### stats
Default: session count, token totals, project breakdown, tool breakdown, hour breakdown
- `--project <path>` — filter to one project
- `--daily` — daily breakdown (date, sessions, tokens)
- `--weekly` — weekly breakdown

### projects
- `--sort <field>` — sessions (default), tokens, or recent

### messages
- `--user` — only user messages
- `--assistant` — only assistant messages
- `--first <n>` — first N messages
- `--last <n>` — last N messages
- `--slice <range>` — message range (e.g. 5:15)
- `--raw` — include tool blocks in content

### files
- `--reads` — only Read tool calls
- `--writes` — only Write tool calls
- `--edits` — only Edit tool calls

### tokens
With session ID: per-turn breakdown (turnIndex, input/output/cache tokens, model)
- `--project <path>` — per-session totals for a project
- `--daily` — daily token totals
- `--by-model` — grouped by model

### export
- `--format <fmt>` — json (default), md, csv
- `--stdout` — write to stdout instead of file

### history
- `--search <text>` — substring match on prompt text
- `--project <path>` — filter by project
- `--since <date>` — filter by date
- `--limit <n>` — max entries (default 50)

## Workflows

Match the user's intent to the right workflow. When iterating "for each session", limit to the 10 most recent unless asked for more.

### Daily Standup / "What did I work on?"
```bash
cse list --today --stdout
cse messages <id> --user --first 1 --stdout    # per session
cse files <id> --stdout                         # per session
```
Synthesize: group by project, summarize intent + files changed + duration.

### Project Context / "What's the history here?"
```bash
cse list --project . --stdout
cse messages <id> --user --first 1 --stdout    # per session
cse stats --project . --stdout
```
Synthesize: narrative of what was worked on, which files are central, total effort.

### File Hotspots / "Which files keep getting edited?"
```bash
cse list --project . --stdout
cse files <id> --stdout                         # per session
```
Synthesize: count file occurrences across sessions, rank by frequency.

### Error Pattern Matching / "We've seen this error before"
```bash
cse search "<error text>" --all --context 2 --stdout
```
Synthesize: find the fix that followed the error.

### Decision Archaeology / "Why was X built this way?"
```bash
cse search "<topic>" --all --context 3 --stdout
cse messages <id> --slice 5:20 --stdout        # for relevant sessions
```
Synthesize: identify where alternatives were discussed, extract rationale.

### Unfinished Work / "What loose ends are there?"
```bash
cse list --project . --stdout
cse messages <id> --last 5 --stdout            # per session
cse search "TODO" --all --project . --stdout
cse search "later" --all --project . --stdout
```
Synthesize: cross-reference session endings with deferred work mentions.

### Working Patterns / "How do I typically work?"
```bash
cse stats --stdout
cse stats --daily --stdout
cse list --sort duration --reverse --limit 10 --stdout
```
Synthesize: peak hours, average session length, most active projects.

### Tool Usage / "What tools does Claude use most?"
```bash
cse stats --project . --stdout
cse show <id> --tools --stdout                 # for specific sessions
```
Synthesize: rank tools by usage, identify patterns.

### Token Cost Tracking / "How much am I spending?"
```bash
cse tokens --daily --stdout
cse tokens --project . --stdout
cse tokens --by-model --stdout
```
Synthesize: apply pricing to token counts, show cost trends.

### Session Export / "Export as markdown"
```bash
cse export <id> --format md --stdout
```

### Weekly Report / "Give me a weekly summary"
```bash
cse list --this-week --stdout
cse stats --weekly --stdout
cse projects --sort recent --stdout
```
Synthesize: projects touched, key sessions, total effort, token spend.

### Cross-Session Search / "Find every time we discussed X"
```bash
cse search "<query>" --all --context 3 --stdout
```
Synthesize: group by project/session, show evolution over time.

## Guidelines

- Use `--project .` when the question is about the current project
- For broad questions, omit `--project` to search all sessions
- Always start with `cse list` or `cse search` to identify relevant sessions before drilling in
- Present token counts with approximate USD costs when doing cost analysis
- For standup summaries, keep output concise — bullet points, not paragraphs
- When showing file hotspots, include the operation type breakdown (read vs write vs edit)
