import { writeError, writeJson, writeTable } from '../output.js';
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

function extractFileOps(blocks: Record<string, unknown>[], messageIndex: number): FileOperation[] {
  const ops: FileOperation[] = [];

  for (const block of blocks) {
    if (block.type !== 'tool_use') continue;

    const operation = TOOL_OP_MAP[block.name as string];
    if (!operation) continue;

    const input = block.input as Record<string, unknown>;
    const filePath = (input.file_path as string) ?? (input.path as string) ?? '';

    ops.push({ filePath, operation, timestamp: 0, messageIndex });
  }

  return ops;
}

function matchesFilter(op: FileOperation, opts: FilesOptions): boolean {
  if (opts.reads && op.operation !== 'read') return false;
  if (opts.writes && op.operation !== 'write') return false;
  if (opts.edits && op.operation !== 'edit') return false;
  return true;
}

export async function files(sessionId: string, opts: FilesOptions): Promise<void> {
  const file = await findConversationFile(opts.claudeDir, sessionId);
  if (!file) {
    writeError(`Session not found: ${sessionId}`);
    process.exit(1);
  }

  const operations: FileOperation[] = [];
  let messageIndex = 0;

  for await (const entry of readJsonlFile(file)) {
    const record = entry as Record<string, unknown>;

    if (record.type === 'assistant' && Array.isArray(record.content)) {
      const ops = extractFileOps(record.content as Record<string, unknown>[], messageIndex);
      for (const op of ops) {
        op.timestamp = (record.timestamp as number) ?? 0;
        if (matchesFilter(op, opts)) operations.push(op);
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
