import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf-8'));

import { exportSession } from './commands/export.js';
import { files } from './commands/files.js';
import { history } from './commands/history.js';
import { list } from './commands/list.js';
import { messages } from './commands/messages.js';
import { projects } from './commands/projects.js';
import { search } from './commands/search.js';
import { show } from './commands/show.js';
import { stats } from './commands/stats.js';
import { tokens } from './commands/tokens.js';

const program = new Command();

program
  .name('cse')
  .description('Deterministic CLI for Claude Code session history')
  .version(pkg.version)
  .option('--claude-dir <path>', 'override ~/.claude location', join(homedir(), '.claude'))
  .option('--out-dir <path>', 'override output directory', '.cse')
  .option('--stdout', 'write to stdout instead of file')
  .option('--json', 'JSON output (default)', true)
  .option('--pretty', 'human-readable table output')
  .option('--no-color', 'disable colored output')
  .option('--verbose', 'debug info to stderr');

function globals(): Record<string, unknown> {
  return program.opts();
}

program
  .command('list')
  .description('List sessions')
  .option('--project <path>', 'filter by project directory')
  .option('--since <date>', 'filter by start date')
  .option('--until <date>', 'filter by end date')
  .option('--today', "shorthand for today's sessions")
  .option('--yesterday', "shorthand for yesterday's sessions")
  .option('--this-week', 'shorthand for current week')
  .option('--kind <kind>', 'filter by session kind')
  .option('--entrypoint <ep>', 'filter by entrypoint (cli/ide/web)')
  .option('--limit <n>', 'limit results', '50')
  .option('--sort <field>', 'sort: date, duration, tokens, messages', 'date')
  .option('--reverse', 'reverse sort order')
  .action((opts) => list({ ...globals(), ...opts, limit: Number(opts.limit) }));

program
  .command('show <session-id>')
  .description('Show session detail')
  .option('--messages', 'all messages with type, timestamp, content length')
  .option('--tools', 'all tool_use blocks')
  .option('--files', 'all file paths from tool_use inputs')
  .option('--tokens', 'per-turn token usage')
  .option('--raw', 'raw JSONL lines')
  .action((id, opts) => show(id, { ...globals(), ...opts }));

program
  .command('search <query>')
  .description('Full-text search across sessions')
  .option('--all', 'search user + assistant content')
  .option('--tools', 'search tool_use inputs/outputs')
  .option('--project <path>', 'scope to project')
  .option('--since <date>', 'filter by date')
  .option('--context <n>', 'include N messages around match')
  .option('--regex', 'treat query as regex')
  .action((query, opts) => search(query, { ...globals(), ...opts }));

program
  .command('stats')
  .description('Aggregate statistics')
  .option('--project <path>', 'per-project stats')
  .option('--daily', 'daily breakdown')
  .option('--weekly', 'weekly breakdown')
  .action((opts) => stats({ ...globals(), ...opts }));

program
  .command('projects')
  .description('List all projects')
  .option('--sort <field>', 'sort: sessions, tokens, recent', 'sessions')
  .action((opts) => projects({ ...globals(), ...opts }));

program
  .command('history')
  .description('Prompt history')
  .option('--search <text>', 'exact substring match on prompt text')
  .option('--project <path>', 'filter by project')
  .option('--since <date>', 'filter by date')
  .option('--limit <n>', 'number of entries', '50')
  .action((opts) => history({ ...globals(), ...opts, limit: Number(opts.limit) }));

program
  .command('files <session-id>')
  .description('Extract file operations')
  .option('--reads', 'only Read tool calls')
  .option('--writes', 'only Write tool calls')
  .option('--edits', 'only Edit tool calls')
  .action((id, opts) => files(id, { ...globals(), ...opts }));

program
  .command('messages <session-id>')
  .description('Extract messages')
  .option('--user', 'only user messages')
  .option('--assistant', 'only assistant messages')
  .option('--first <n>', 'first N messages')
  .option('--last <n>', 'last N messages')
  .option('--slice <range>', 'message range by index (e.g. 5:15)')
  .option('--raw', 'include tool blocks')
  .action((id, opts) =>
    messages(id, {
      ...globals(),
      ...opts,
      first: opts.first ? Number(opts.first) : undefined,
      last: opts.last ? Number(opts.last) : undefined,
    }),
  );

program
  .command('tokens [session-id]')
  .description('Token usage')
  .option('--project <path>', 'aggregate per-session for a project')
  .option('--daily', 'daily token totals')
  .option('--by-model', 'grouped by model')
  .action((id, opts) => tokens(id, { ...globals(), ...opts }));

program
  .command('export [session-id]')
  .description('Export data')
  .option('--format <fmt>', 'output format: json, md, csv', 'json')
  .option('--all', 'export all sessions')
  .option('--project <path>', 'export project sessions')
  .action((id, opts) => exportSession(id, { ...globals(), ...opts }));

program.parseAsync();
