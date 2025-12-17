import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function persistArtifact(args: {
  rootDir: string;
  sessionId: string;
  kind: string;
  pageIndex?: number | null;
  ext: string;
  bytes: Buffer;
}) {
  const sha256 = createHash('sha256').update(args.bytes).digest('hex');
  const dir = path.join(args.rootDir, args.sessionId);
  await mkdir(dir, { recursive: true });
  const pagePart = args.pageIndex != null ? `p${args.pageIndex}` : 'pNA';
  const filename = `${args.kind}-${pagePart}-${sha256.slice(0, 12)}.${args.ext}`;
  const fullPath = path.join(dir, filename);
  await writeFile(fullPath, args.bytes);
  return { sha256, path: fullPath };
}

export function base64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

export function bufferToDataUrl(mimeType: string, buffer: Buffer) {
  const b64 = buffer.toString('base64');
  return `data:${mimeType};base64,${b64}`;
}
