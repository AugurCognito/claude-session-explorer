# Changelog

## 0.3.0 (2026-07-06)

### Bug Fixes

- **Session discovery**: `list`, `stats`, and `tokens` now enumerate `projects/*/*.jsonl` directly instead of relying on `sessions/*.json` metadata files, which only exist for running/recent sessions. Previously most sessions were invisible (e.g. 3 found vs 103 actual).
- **Token over-count**: Each assistant response is split across multiple JSONL entries sharing the same `message.id` with identical `usage` objects. Naive sum inflated tokens ~3x. Added `aggregateUsage()` that deduplicates by `message.id` before summing.
- **JSONL parse crash**: Malformed lines (truncated writes, partial JSON) crashed the entire read. Now uses per-line error handling — bad lines emit a stderr warning and are skipped.
- **CLI async handling**: Switched from `program.parse()` to `program.parseAsync()` so unhandled rejections from async command actions surface properly.
- **Version desync**: CLI version is now read from `package.json` at runtime instead of a hardcoded string.

### Infrastructure

- Added vitest, lefthook, knip, commitlint, dependency-cruiser, ast-grep slop rules.
- Added test fixtures with known-truth token values for regression testing.
- Consolidated CI to single `pnpm verify` gate.

## 0.2.3

- Fix npm OIDC publishing with Node 24.

## 0.2.0

- Initial public release with `list`, `show`, `search`, `stats`, `projects`, `history`, `files`, `messages`, `tokens`, and `export` commands.
