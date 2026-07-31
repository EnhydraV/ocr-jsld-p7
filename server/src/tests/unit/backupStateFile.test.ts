import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readState, statePath, writeState, type BackupState } from '../../lib/backupState';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'orion-state-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const sample: BackupState = {
  lastRun: '2026-07-31T11:30:00Z',
  status: 'ok',
  intervalMinutes: 60,
  lastVerified: 'orion-20260731-040000.db',
  lastVerifiedAt: '2026-07-31T04:00:01Z',
};

describe('backup state file', () => {
  it('writes then reads the state back unchanged', () => {
    writeState(directory, sample);

    expect(readState(directory)).toEqual(sample);
  });

  it('reports no state before the first backup', () => {
    expect(readState(directory)).toBeNull();
  });

  // Un arrêt brutal en pleine écriture laisse un fichier tronqué : le
  // healthcheck doit conclure « aucune sauvegarde » plutôt que planter.
  it('treats a truncated state file as absent instead of crashing', () => {
    writeFileSync(statePath(directory), '{"lastRun":');

    expect(readState(directory)).toBeNull();
  });

  it('records a failure with its cause', () => {
    writeState(directory, { ...sample, status: 'failed', message: 'instantané NON restaurable' });

    const state = readState(directory);

    expect(state?.status).toBe('failed');
    expect(state?.message).toContain('NON restaurable');
    // La trace du dernier instantané vérifié survit à l'échec : c'est vers lui
    // qu'on se replie (§ 7.3)
    expect(state?.lastVerified).toBe(sample.lastVerified);
  });
});
