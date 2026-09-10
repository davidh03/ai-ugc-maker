import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';

const execFileP = promisify(execFile);

export async function probeDurationSec(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    const probe = await execFileP('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
    const value = Number(probe.stdout.trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch { return null; }
}
