import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { writeJson, writeTable } from '../output.js';
import { listProjectDirs, readJsonlFile } from '../reader.js';
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

    let totalTokens = 0;
    let firstSession = Number.MAX_SAFE_INTEGER;
    let lastSession = 0;

    for (const f of sessionFiles) {
      const filePath = join(dir, f);
      const fileStat = await stat(filePath);
      const mtimeMs = fileStat.mtimeMs;
      const ctimeMs = fileStat.birthtimeMs || fileStat.ctimeMs;

      if (ctimeMs < firstSession) firstSession = ctimeMs;
      if (mtimeMs > lastSession) lastSession = mtimeMs;

      for await (const entry of readJsonlFile(filePath)) {
        const record = entry as Record<string, unknown>;
        if (record.type !== 'assistant') continue;
        const message = record.message as Record<string, unknown> | undefined;
        const usage = message?.usage as Record<string, number> | undefined;
        if (usage) {
          totalTokens +=
            (usage.input_tokens ?? 0) +
            (usage.output_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0);
        }
      }
    }

    results.push({
      path: slug.replaceAll('-', '/'),
      slug,
      sessionCount: sessionFiles.length,
      totalTokens,
      firstSession: firstSession === Number.MAX_SAFE_INTEGER ? 0 : Math.floor(firstSession),
      lastSession: Math.floor(lastSession),
    });
  }

  if (opts.sort === 'recent') {
    results.sort((a, b) => b.lastSession - a.lastSession);
  } else if (opts.sort === 'tokens') {
    results.sort((a, b) => b.totalTokens - a.totalTokens);
  } else {
    results.sort((a, b) => b.sessionCount - a.sessionCount);
  }

  if (opts.pretty) {
    writeTable(
      ['Path', 'Sessions', 'Tokens'],
      results.map((p) => [p.path, String(p.sessionCount), String(p.totalTokens)]),
    );
  } else {
    writeJson(results);
  }
}
