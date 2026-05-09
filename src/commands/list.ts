import { formatTimestamp, writeJson, writeTable } from '../output.js';
import { listSessionFiles, readSessionMeta } from '../reader.js';
import type { GlobalOptions, SessionMeta } from '../types.js';

interface ListOptions extends GlobalOptions {
  project?: string;
  since?: string;
  until?: string;
  today?: boolean;
  thisWeek?: boolean;
  kind?: string;
  entrypoint?: string;
  limit: number;
  sort: string;
  reverse?: boolean;
}

interface SessionRow {
  id: string;
  date: string;
  project: string;
  kind: string;
  entrypoint: string;
  startedAt: number;
}

function matchesFilters(meta: SessionMeta, opts: ListOptions): boolean {
  if (opts.project && !meta.cwd.startsWith(opts.project)) return false;
  if (opts.kind && meta.kind !== opts.kind) return false;
  if (opts.entrypoint && meta.entrypoint !== opts.entrypoint) return false;
  if (opts.since && meta.startedAt < new Date(opts.since).getTime()) return false;
  if (opts.until && meta.startedAt > new Date(opts.until).getTime()) return false;
  if (opts.today && meta.startedAt < todayStart()) return false;
  if (opts.thisWeek && meta.startedAt < weekStart()) return false;
  return true;
}

function todayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function weekStart(): number {
  const now = new Date();
  const d = new Date(now);
  d.setDate(now.getDate() - now.getDay());
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export async function list(opts: ListOptions): Promise<void> {
  const files = await listSessionFiles(opts.claudeDir);
  const sessions: SessionRow[] = [];

  for (const file of files) {
    const meta = await readSessionMeta(file);
    if (!meta || !matchesFilters(meta, opts)) continue;

    sessions.push({
      id: meta.sessionId,
      date: formatTimestamp(meta.startedAt),
      project: meta.cwd,
      kind: meta.kind,
      entrypoint: meta.entrypoint,
      startedAt: meta.startedAt,
    });
  }

  sessions.sort((a, b) => b.startedAt - a.startedAt);
  if (opts.reverse) sessions.reverse();

  const limited = sessions.slice(0, opts.limit);

  if (opts.pretty) {
    writeTable(
      ['ID', 'Date', 'Project', 'Kind', 'Entrypoint'],
      limited.map((s) => [s.id, s.date, s.project, s.kind, s.entrypoint]),
    );
  } else {
    writeJson(limited);
  }
}
