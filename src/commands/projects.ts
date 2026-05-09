import { readdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { writeJson, writeTable } from '../output.js';
import { listProjectDirs } from '../reader.js';
import type { GlobalOptions, ProjectInfo } from '../types.js';

interface ProjectsOptions extends GlobalOptions {
  sort: string;
}

export async function projects(opts: ProjectsOptions): Promise<void> {
  const dirs = await listProjectDirs(opts.claudeDir);
  const results: ProjectInfo[] = [];

  for (const dir of dirs) {
    const slug = basename(dir);
    const files = await readdir(dir);
    const sessionFiles = files.filter((f) => f.endsWith('.jsonl'));

    results.push({
      path: slug.replaceAll('-', '/'),
      slug,
      sessionCount: sessionFiles.length,
      totalTokens: 0,
      firstSession: 0,
      lastSession: 0,
    });
  }

  if (opts.sort === 'sessions') {
    results.sort((a, b) => b.sessionCount - a.sessionCount);
  }

  if (opts.pretty) {
    writeTable(
      ['Path', 'Slug', 'Sessions'],
      results.map((p) => [p.path, p.slug, String(p.sessionCount)]),
    );
  } else {
    writeJson(results);
  }
}
