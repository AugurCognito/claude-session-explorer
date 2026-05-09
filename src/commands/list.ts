import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { formatDuration, formatTimestamp, writeJson, writeTable } from '../output.js';
import { listProjectDirs, listSessionFiles, readJsonlFile, readSessionMeta } from '../reader.js';
import type { GlobalOptions, SessionMeta } from '../types.js';

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

function matchesFilters(meta: SessionMeta, opts: ListOptions): boolean {
  if (opts.project && !meta.cwd.startsWith(opts.project)) return false;
  if (opts.kind && meta.kind !== opts.kind) return false;
  if (opts.entrypoint && meta.entrypoint !== opts.entrypoint) return false;
  if (opts.since && meta.startedAt < new Date(opts.since).getTime()) return false;
  if (opts.until && meta.startedAt > new Date(opts.until).getTime()) return false;
  if (opts.today && meta.startedAt < todayStart()) return false;
  if (opts.yesterday) {
    const ys = yesterdayStart();
    if (meta.startedAt < ys || meta.startedAt >= ys + 86400000) return false;
  }
  if (opts.thisWeek && meta.startedAt < weekStart()) return false;
  return true;
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

async function findTitle(
  claudeDir: string,
  sessionId: string,
): Promise<{ title: string; durationMs: number }> {
  let title = '';
  let firstTs = 0;
  let lastTs = 0;

  const projectDirs = await listProjectDirs(claudeDir);
  for (const dir of projectDirs) {
    const files = await readdir(dir);
    const match = files.find((f) => f.includes(sessionId) && f.endsWith('.jsonl'));
    if (!match) continue;

    for await (const entry of readJsonlFile(join(dir, match))) {
      const record = entry as Record<string, unknown>;
      if (record.type === 'ai-title') {
        title = record.aiTitle as string;
      }
      const ts = record.timestamp as string | undefined;
      if (ts) {
        const ms = new Date(ts).getTime();
        if (!firstTs || ms < firstTs) firstTs = ms;
        if (ms > lastTs) lastTs = ms;
      }
    }
    break;
  }

  return { title, durationMs: lastTs - firstTs };
}

export async function list(opts: ListOptions): Promise<void> {
  const files = await listSessionFiles(opts.claudeDir);
  const sessions: SessionRow[] = [];

  for (const file of files) {
    const meta = await readSessionMeta(file);
    if (!meta || !matchesFilters(meta, opts)) continue;

    const { title, durationMs } = await findTitle(opts.claudeDir, meta.sessionId);

    sessions.push({
      id: meta.sessionId,
      title,
      date: formatTimestamp(meta.startedAt),
      project: meta.cwd,
      duration: durationMs > 0 ? formatDuration(durationMs) : '',
      kind: meta.kind,
      entrypoint: meta.entrypoint,
      startedAt: meta.startedAt,
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
