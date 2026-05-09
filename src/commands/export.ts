import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GlobalOptions } from "../types.js";
import { findConversationFile, readJsonlFile } from "../reader.js";
import { writeJson, writeError } from "../output.js";

interface ExportOptions extends GlobalOptions {
  format: string;
  all?: boolean;
  project?: string;
}

export async function exportSession(
  sessionId: string | undefined,
  opts: ExportOptions,
): Promise<void> {
  if (!sessionId) {
    writeError("Session ID required (--all not yet implemented)");
    process.exit(1);
  }

  const file = await findConversationFile(opts.claudeDir, sessionId);
  if (!file) {
    writeError(`Session not found: ${sessionId}`);
    process.exit(1);
  }

  const entries: unknown[] = [];
  for await (const entry of readJsonlFile(file)) {
    entries.push(entry);
  }

  if (opts.stdout) {
    writeJson(entries);
    return;
  }

  await mkdir(opts.outDir, { recursive: true });
  const outPath = join(opts.outDir, `${sessionId}.${opts.format}`);

  if (opts.format === "json") {
    await writeFile(outPath, JSON.stringify(entries, null, 2));
  } else if (opts.format === "md") {
    const md = entries
      .filter((e) => {
        const r = e as Record<string, unknown>;
        return r.type === "user" || r.type === "assistant";
      })
      .map((e) => {
        const r = e as Record<string, unknown>;
        const role = r.type === "user" ? "User" : "Assistant";
        const content =
          typeof r.content === "string"
            ? r.content
            : JSON.stringify(r.content);
        return `## ${role}\n\n${content}`;
      })
      .join("\n\n---\n\n");

    await writeFile(outPath, md);
  }

  process.stderr.write(`Exported to ${outPath}\n`);
}
