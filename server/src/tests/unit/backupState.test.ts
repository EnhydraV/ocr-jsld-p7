import { describe, it, expect } from 'vitest';
import { evaluateHealth, type BackupState } from '../../lib/backupState';

const NOW = new Date('2026-07-31T12:00:00Z');

const state = (overrides: Partial<BackupState> = {}): BackupState => ({
  lastRun: '2026-07-31T11:30:00Z',
  status: 'ok',
  intervalMinutes: 60,
  ...overrides,
});

describe('evaluateHealth', () => {
  it('reports a healthy scheduler after a recent successful backup', () => {
    expect(evaluateHealth(state(), NOW).healthy).toBe(true);
  });

  // C'est le cœur de la question : un échec doit être détectable par une
  // machine, pas seulement lisible dans les journaux.
  it('reports unhealthy when the last backup failed', () => {
    const verdict = evaluateHealth(state({ status: 'failed', message: 'instantané NON restaurable' }), NOW);

    expect(verdict.healthy).toBe(false);
    expect(verdict.reason).toContain('NON restaurable');
  });

  // Le cas le plus dangereux : le planificateur bloqué n'émet aucun message,
  // donc seul le silence lui-même peut le trahir.
  it('reports unhealthy when no backup happened for two cycles', () => {
    const verdict = evaluateHealth(state({ lastRun: '2026-07-31T09:30:00Z' }), NOW);

    expect(verdict.healthy).toBe(false);
    expect(verdict.reason).toContain('aucune sauvegarde depuis');
  });

  it('tolerates one missed cycle before complaining', () => {
    // 90 min avec une cadence de 60 min : en retard, mais dans la tolérance
    expect(evaluateHealth(state({ lastRun: '2026-07-31T10:30:00Z' }), NOW).healthy).toBe(true);
  });

  it('adapts the tolerance to the declared interval', () => {
    const quarterly = state({ lastRun: '2026-07-31T11:20:00Z', intervalMinutes: 15 });

    expect(evaluateHealth(quarterly, NOW).healthy).toBe(false);
  });

  it('reports unhealthy when no state has ever been written', () => {
    const verdict = evaluateHealth(null, NOW);

    expect(verdict.healthy).toBe(false);
    expect(verdict.reason).toContain('aucune sauvegarde');
  });
});
