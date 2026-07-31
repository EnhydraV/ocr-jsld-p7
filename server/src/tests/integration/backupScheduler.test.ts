import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runScheduledBackup } from '../../lib/backupScheduler';
import { readState, writeState } from '../../lib/backupState';

const SOURCE_DATABASE = join('prisma', 'test.db');

let workspace: string;
let backupDir: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'orion-sched-'));
  backupDir = join(workspace, 'backups');
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

const run = (overrides: { databaseFile?: string; now?: Date; verifyHour?: number } = {}) =>
  runScheduledBackup({
    databaseFile: overrides.databaseFile ?? SOURCE_DATABASE,
    backupDir,
    intervalMinutes: 60,
    verifyHour: overrides.verifyHour ?? 4,
    now: overrides.now ?? new Date('2026-07-31T09:00:00Z'),
  });

describe('runScheduledBackup', () => {
  it('records a successful run in the state file', async () => {
    const result = await run();

    expect(result.failure).toBeUndefined();
    expect(result.snapshot?.inspection.integrity).toBe('ok');
    expect(readState(backupDir)).toMatchObject({ status: 'ok', intervalMinutes: 60 });
  });

  it('verifies restorability at the configured hour only', async () => {
    const outside = await run({ now: new Date('2026-07-31T09:00:00Z') });
    expect(outside.verified).toBeUndefined();

    const atVerifyHour = await run({ now: new Date('2026-07-31T04:00:00Z') });

    expect(atVerifyHour.verified?.inspection.integrity).toBe('ok');
    // C'est bien l'instantané de ce tour qui est vérifié, et le champ garde un
    // NOM de fichier, jamais un chemin
    expect(readState(backupDir)?.lastVerified).toBe(atVerifyHour.snapshot?.name);
    expect(readState(backupDir)?.lastVerified).toBe('orion-20260731-040000.db');
  });

  // Le contrat de la fonction : elle ne lève JAMAIS, sinon un incident ponctuel
  // tuerait le planificateur et l'application n'aurait plus de sauvegardes.
  it('never throws when the backup fails, and records the cause', async () => {
    const result = await run({ databaseFile: join(workspace, 'absente.db') });

    expect(result.failure).toMatch(/introuvable/);
    expect(readState(backupDir)).toMatchObject({ status: 'failed' });
    expect(readState(backupDir)?.message).toMatch(/introuvable/);
  });

  // Sans cela, un échec effacerait la référence du seul instantané sûr — c'est
  // précisément celui vers lequel se replier (§ 7.3).
  it('keeps the last verified snapshot across a failure', async () => {
    writeState(backupDir, {
      lastRun: '2026-07-31T04:00:00Z',
      status: 'ok',
      intervalMinutes: 60,
      lastVerified: 'orion-20260731-040000.db',
      lastVerifiedAt: '2026-07-31T04:00:01Z',
    });

    await run({ databaseFile: join(workspace, 'absente.db') });

    expect(readState(backupDir)).toMatchObject({
      status: 'failed',
      lastVerified: 'orion-20260731-040000.db',
      lastVerifiedAt: '2026-07-31T04:00:01Z',
    });
  });

  it('carries the previous verification forward on a run that does not verify', async () => {
    await run({ now: new Date('2026-07-31T04:00:00Z') });
    const verifiedBefore = readState(backupDir)?.lastVerified;

    await run({ now: new Date('2026-07-31T10:00:00Z') });

    expect(readState(backupDir)?.lastVerified).toBe(verifiedBefore);
  });
});
