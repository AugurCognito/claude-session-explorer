import { formatDuration, formatTimestamp, writeJson, writeTable } from '../output.js';
import { discoverSessions, readSessionInfo } from '../reader.js';
import type { GlobalOptions } from '../types.js';

interface ListOptions extends GlobalOptions {
  project?: string;
  since?: string;
  until?: string;
  today?: boolean;
  yesterday?: boolean;
  thisWeek?: boolean;
  kind?: string;
  entrypoint?: string;
  limit: number;
  sort: string;
  reverse?: boolean;
}

interface SessionRow {
  id: string;
  title: string;
  date: string;
  project: string;
  duration: string;
  kind: string;
  entrypoint: string;
  startedAt: number;
  durationMs: number;
}

export async function list(opts: ListOptions): Promise<void> {
  const discovered = await discoverSessions(opts.claudeDir);
  const sessions: SessionRow[] = [];

  for (const s of discovered) {
    const info = await readSessionInfo(s.filePath);

    if (opts.project && !info.cwd.startsWith(opts.project)) continue;
    if (opts.entrypoint && info.entrypoint !== opts.entrypoint) continue;
    if (opts.since && info.startedAt < new Date(opts.since).getTime()) continue;
    if (opts.until && info.startedAt > new Date(opts.until).getTime()) continue;
    if (opts.today && info.startedAt < todayStart()) continue;
    if (opts.yesterday) {
      const ys = yesterdayStart();
      if (info.startedAt < ys || info.startedAt >= ys + 86400000) continue;
    }
    if (opts.thisWeek && info.startedAt < weekStart()) continue;

    const durationMs = info.updatedAt - info.startedAt;

    sessions.push({
      id: s.sessionId,
      title: info.title,
      date: formatTimestamp(info.startedAt),
      project: info.cwd,
      duration: durationMs > 0 ? formatDuration(durationMs) : '',
      kind: '',
      entrypoint: info.entrypoint,
      startedAt: info.startedAt,
      durationMs,
    });
  }

  if (opts.sort === 'duration') {
    sessions.sort((a, b) => b.durationMs - a.durationMs);
  } else {
    sessions.sort((a, b) => b.startedAt - a.startedAt);
  }
  if (opts.reverse) sessions.reverse();

  const limited = sessions.slice(0, opts.limit);

  if (opts.pretty) {
    writeTable(
      ['ID', 'Title', 'Date', 'Duration', 'Project'],
      limited.map((s) => [s.id.slice(0, 8), s.title.slice(0, 40), s.date, s.duration, s.project]),
    );
  } else {
    writeJson(limited);
  }
}

function todayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function yesterdayStart(): number {
  return todayStart() - 86400000;
}

function weekStart(): number {
  const now = new Date();
  const d = new Date(now);
  d.setDate(now.getDate() - now.getDay());
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
