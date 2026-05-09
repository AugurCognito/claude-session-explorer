import type { GlobalOptions, FileOperation } from "../types.js";
import { findConversationFile, readJsonlFile } from "../reader.js";
import { writeJson, writeTable, writeError } from "../output.js";

interface FilesOptions extends GlobalOptions {
  reads?: boolean;
  writes?: boolean;
  edits?: boolean;
}

const TOOL_OP_MAP: Record<string, FileOperation["operation"]> = {
  Read: "read",
  Write: "write",
  Edit: "edit",
};

export async function files(
  sessionId: string,
  opts: FilesOptions,
): Promise<void> {
  const file = await findConversationFile(opts.claudeDir, sessionId);
  if (!file) {
    writeError(`Session not found: ${sessionId}`);
    process.exit(1);
  }

  const operations: FileOperation[] = [];
  let messageIndex = 0;

  for await (const entry of readJsonlFile(file)) {
    const record = entry as Record<string, unknown>;

    if (record.type === "assistant" && Array.isArray(record.content)) {
      for (const block of record.content as Record<string, unknown>[]) {
        if (block.type !== "tool_use") continue;

        const toolName = block.name as string;
        const operation = TOOL_OP_MAP[toolName];
        if (!operation) continue;

        if (opts.reads && operation !== "read") continue;
        if (opts.writes && operation !== "write") continue;
        if (opts.edits && operation !== "edit") continue;

        const input = block.input as Record<string, unknown>;
        const filePath = (input.file_path as string) ?? (input.path as string) ?? "";

        operations.push({
          filePath,
          operation,
          timestamp: (record.timestamp as number) ?? 0,
          messageIndex,
        });
      }
    }
    messageIndex++;
  }

  if (opts.pretty) {
    writeTable(
      ["File", "Op", "Index"],
      operations.map((o) => [o.filePath, o.operation, String(o.messageIndex)]),
    );
  } else {
    writeJson(operations);
  }
}
