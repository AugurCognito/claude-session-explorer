import { writeJson, writeTable } from '../output.js';
import { findConversationFile, readJsonlFile } from '../reader.js';
import type { FileOperation, GlobalOptions } from '../types.js';

interface FilesOptions extends GlobalOptions {
  reads?: boolean;
  writes?: boolean;
  edits?: boolean;
}

const TOOL_OP_MAP: Record<string, FileOperation['operation']> = {
  Read: 'read',
  Write: 'write',
  Edit: 'edit',
};

function extractFileOps(
  blocks: Record<string, unknown>[],
  messageIndex: number,
  timestamp: number,
): FileOperation[] {
  const ops: FileOperation[] = [];

  for (const block of blocks) {
    if (block.type !== 'tool_use') continue;

    const operation = TOOL_OP_MAP[block.name as string];
    if (!operation) continue;

    const input = block.input as Record<string, unknown>;
    const filePath = (input.file_path as string) ?? (input.path as string) ?? '';

    ops.push({ filePath, operation, timestamp, messageIndex });
  }

  return ops;
}

export async function files(sessionId: string, opts: FilesOptions): Promise<void> {
  const file = await findConversationFile(opts.claudeDir, sessionId);
  if (!file) {
    process.stderr.write(`error: session not found: ${sessionId}\n`);
    process.exit(1);
  }

  const operations: FileOperation[] = [];
  let messageIndex = 0;

  for await (const entry of readJsonlFile(file)) {
    const record = entry as Record<string, unknown>;

    if (record.type === 'assistant') {
      const message = record.message as Record<string, unknown> | undefined;
      const content = message?.content;

      if (Array.isArray(content)) {
        const ops = extractFileOps(
          content as Record<string, unknown>[],
          messageIndex,
          (record.timestamp as number) ?? 0,
        );
        for (const op of ops) {
          if (opts.reads && op.operation !== 'read') continue;
          if (opts.writes && op.operation !== 'write') continue;
          if (opts.edits && op.operation !== 'edit') continue;
          operations.push(op);
        }
      }
    }
    messageIndex++;
  }

  if (opts.pretty) {
    writeTable(
      ['File', 'Op', 'Index'],
      operations.map((o) => [o.filePath, o.operation, String(o.messageIndex)]),
    );
  } else {
    writeJson(operations);
  }
}
