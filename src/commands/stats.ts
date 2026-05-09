import { writeJson, writeTable } from '../output.js';
import { listSessionFiles, readSessionMeta } from '../reader.js';
import type { GlobalOptions } from '../types.js';

interface StatsOptions extends GlobalOptions {
  project?: string;
  daily?: boolean;
  weekly?: boolean;
}

export async function stats(opts: StatsOptions): Promise<void> {
  const files = await listSessionFiles(opts.claudeDir);
  let sessionCount = 0;
  const projectCounts = new Map<string, number>();
  const hourCounts = new Array(24).fill(0) as number[];

  for (const file of files) {
    const meta = await readSessionMeta(file);
    if (!meta) continue;
    if (opts.project && !meta.cwd.startsWith(opts.project)) continue;

    sessionCount++;
    projectCounts.set(meta.cwd, (projectCounts.get(meta.cwd) ?? 0) + 1);
    const hour = new Date(meta.startedAt).getHours();
    hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;
  }

  const result = {
    sessionCount,
    projectBreakdown: [...projectCounts.entries()]
      .map(([path, count]) => ({ path, sessionCount: count }))
      .sort((a, b) => b.sessionCount - a.sessionCount),
    hourBreakdown: hourCounts.map((count, hour) => ({ hour, sessionCount: count })),
  };

  if (opts.pretty) {
    writeTable(
      ['Metric', 'Value'],
      [
        ['Sessions', String(sessionCount)],
        ['Projects', String(projectCounts.size)],
      ],
    );
  } else {
    writeJson(result);
  }
}
