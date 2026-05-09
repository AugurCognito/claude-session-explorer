import { formatTimestamp, writeJson, writeTable } from '../output.js';
import { readHistory } from '../reader.js';
import type { GlobalOptions } from '../types.js';

interface HistoryOptions extends GlobalOptions {
  search?: string;
  project?: string;
  since?: string;
  limit: number;
}

export async function history(opts: HistoryOptions): Promise<void> {
  const entries: Array<{
    display: string;
    timestamp: number;
    project: string;
    sessionId: string | undefined;
  }> = [];

  for await (const entry of readHistory(opts.claudeDir)) {
    if (opts.search && !entry.display.includes(opts.search)) continue;
    if (opts.project && !entry.project.startsWith(opts.project)) continue;
    if (opts.since && entry.timestamp < new Date(opts.since).getTime()) continue;

    entries.push({
      display: entry.display,
      timestamp: entry.timestamp,
      project: entry.project,
      sessionId: entry.sessionId,
    });
  }

  entries.sort((a, b) => b.timestamp - a.timestamp);
  const limited = entries.slice(0, opts.limit);

  if (opts.pretty) {
    writeTable(
      ['Timestamp', 'Project', 'Prompt'],
      limited.map((e) => [formatTimestamp(e.timestamp), e.project, e.display.slice(0, 80)]),
    );
  } else {
    writeJson(limited);
  }
}
