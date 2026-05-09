import type { GlobalOptions } from "../types.js";
import { listSessionFiles, readSessionMeta } from "../reader.js";
import { writeJson, writeTable, formatTimestamp } from "../output.js";

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

export async function list(opts: ListOptions): Promise<void> {
  const files = await listSessionFiles(opts.claudeDir);
  const sessions: Array<{
    id: string;
    date: string;
    project: string;
    kind: string;
    entrypoint: string;
    startedAt: number;
  }> = [];

  for (const file of files) {
    const meta = await readSessionMeta(file);
    if (!meta) continue;

    if (opts.project && !meta.cwd.startsWith(opts.project)) continue;
    if (opts.kind && meta.kind !== opts.kind) continue;
    if (opts.entrypoint && meta.entrypoint !== opts.entrypoint) continue;

    const startedAt = meta.startedAt;

    if (opts.since && startedAt < new Date(opts.since).getTime()) continue;
    if (opts.until && startedAt > new Date(opts.until).getTime()) continue;

    if (opts.today) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      if (startedAt < todayStart.getTime()) continue;
    }

    if (opts.thisWeek) {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      if (startedAt < weekStart.getTime()) continue;
    }

    sessions.push({
      id: meta.sessionId,
      date: formatTimestamp(startedAt),
      project: meta.cwd,
      kind: meta.kind,
      entrypoint: meta.entrypoint,
      startedAt,
    });
  }

  sessions.sort((a, b) => b.startedAt - a.startedAt);
  if (opts.reverse) sessions.reverse();

  const limited = sessions.slice(0, opts.limit);

  if (opts.pretty) {
    writeTable(
      ["ID", "Date", "Project", "Kind", "Entrypoint"],
      limited.map((s) => [s.id, s.date, s.project, s.kind, s.entrypoint]),
    );
  } else {
    writeJson(limited);
  }
}
