import type { Server } from 'node:http';

export function run(
  cmd: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): Promise<void>;
export function serveDir(root: string, ports: number[]): Promise<{ server: Server; port: number }>;
export function packStage(opts: {
  base: string;
  exposeRepo: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<string>;
export function snapshotFiles(paths: string[]): Promise<() => Promise<void>>;
