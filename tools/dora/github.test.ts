import { describe, it, expect } from 'vitest';
import { DEFAULT_WORKFLOW_PATH, selectMeasuredRuns } from './github.js';
import type { WorkflowRun } from './types.js';

interface RunOptions {
  number: number;
  path?: string;
  branch?: string;
  startedAt: string;
}

function buildRun(options: RunOptions): WorkflowRun {
  return {
    id: options.number * 1000,
    run_number: options.number,
    event: 'push',
    head_branch: options.branch ?? 'main',
    head_sha: `sha${options.number}`.padEnd(40, '0'),
    path: options.path ?? DEFAULT_WORKFLOW_PATH,
    conclusion: 'success',
    run_started_at: options.startedAt,
    updated_at: options.startedAt,
    display_title: `commit ${options.number}`,
    head_commit: { timestamp: options.startedAt, message: 'msg' },
  };
}

describe('selectMeasuredRuns', () => {
  // Depuis l'activation de Dependabot, le dépôt exécute des runs
  // « Dependabot Updates » sur main. Les compter fausse le MTTR, le nombre de
  // runs verts et le délai de premier signal — mesuré : 61 s au lieu de 22 s.
  it('leaves out runs produced by another workflow', () => {
    const runs = [
      buildRun({ number: 1, startedAt: '2026-08-04T08:00:00Z' }),
      buildRun({ number: 2, startedAt: '2026-08-04T09:00:00Z', path: 'dynamic/dependabot/dependabot-updates' }),
      buildRun({ number: 3, startedAt: '2026-08-04T10:00:00Z' }),
    ];

    expect(selectMeasuredRuns(runs, DEFAULT_WORKFLOW_PATH).map((run) => run.run_number)).toEqual([1, 3]);
  });

  it('leaves out runs from other branches', () => {
    const runs = [
      buildRun({ number: 1, startedAt: '2026-08-04T08:00:00Z' }),
      buildRun({ number: 2, startedAt: '2026-08-04T09:00:00Z', branch: 'feature' }),
    ];

    expect(selectMeasuredRuns(runs, DEFAULT_WORKFLOW_PATH).map((run) => run.run_number)).toEqual([1]);
  });

  // Les épisodes de rétablissement se déduisent de l'enchaînement rouge → vert :
  // un ordre d'arrivée non chronologique inventerait des épisodes.
  it('sorts runs from oldest to newest', () => {
    const runs = [
      buildRun({ number: 3, startedAt: '2026-08-04T10:00:00Z' }),
      buildRun({ number: 1, startedAt: '2026-08-04T08:00:00Z' }),
      buildRun({ number: 2, startedAt: '2026-08-04T09:00:00Z' }),
    ];

    expect(selectMeasuredRuns(runs, DEFAULT_WORKFLOW_PATH).map((run) => run.run_number)).toEqual([1, 2, 3]);
  });

  it('accepts another workflow path so the tooling is not tied to this repository', () => {
    const runs = [
      buildRun({ number: 1, startedAt: '2026-08-04T08:00:00Z' }),
      buildRun({ number: 2, startedAt: '2026-08-04T09:00:00Z', path: '.github/workflows/release.yml' }),
    ];

    expect(selectMeasuredRuns(runs, '.github/workflows/release.yml').map((run) => run.run_number)).toEqual([2]);
  });
});
