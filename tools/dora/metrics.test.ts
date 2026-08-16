import { describe, it, expect } from 'vitest';
import {
  computeMetrics,
  findPublications,
  firstFailureSignalSeconds,
  isMergedPullRequest,
  recoveryEpisodes,
} from './metrics.js';
import type { RunWithJobs, WorkflowJob, WorkflowRun } from './types.js';

interface RunOptions {
  number: number;
  conclusion: string | null;
  event?: string;
  path?: string;
  title?: string;
  startedAt: string;
  updatedAt: string;
  committedAt?: string | null;
}

function buildRun(options: RunOptions): WorkflowRun {
  return {
    id: options.number * 1000,
    run_number: options.number,
    event: options.event ?? 'push',
    head_branch: 'main',
    head_sha: `sha${options.number}`.padEnd(40, '0'),
    path: options.path ?? '.github/workflows/ci.yml',
    conclusion: options.conclusion,
    run_started_at: options.startedAt,
    updated_at: options.updatedAt,
    display_title: options.title ?? `commit ${options.number}`,
    head_commit:
      options.committedAt === null ? null : { timestamp: options.committedAt ?? options.startedAt, message: 'msg' },
  };
}

function buildJob(name: string, conclusion: string | null, startedAt: string, completedAt: string): WorkflowJob {
  return { id: Math.round(Date.parse(startedAt) / 1000), name, conclusion, started_at: startedAt, completed_at: completedAt };
}

describe('recoveryEpisodes', () => {
  it('groups consecutive failures into a single episode', () => {
    const entries: RunWithJobs[] = [
      { run: buildRun({ number: 1, conclusion: 'failure', startedAt: '2026-07-23T10:00:00Z', updatedAt: '2026-07-23T10:02:00Z' }), jobs: [] },
      { run: buildRun({ number: 2, conclusion: 'failure', startedAt: '2026-07-23T11:00:00Z', updatedAt: '2026-07-23T11:02:00Z' }), jobs: [] },
      { run: buildRun({ number: 3, conclusion: 'success', startedAt: '2026-07-23T12:00:00Z', updatedAt: '2026-07-23T12:02:00Z' }), jobs: [] },
    ];

    const episodes = recoveryEpisodes(entries);

    expect(episodes).toHaveLength(1);
    expect(episodes[0].runNumbers).toEqual([1, 2]);
    // Du premier rouge (10:02) au vert qui rétablit (12:02) = 2 h
    expect(episodes[0].hours).toBe(2);
  });

  it('leaves the last episode open when the pipeline is still red', () => {
    const entries: RunWithJobs[] = [
      { run: buildRun({ number: 1, conclusion: 'success', startedAt: '2026-07-23T10:00:00Z', updatedAt: '2026-07-23T10:02:00Z' }), jobs: [] },
      { run: buildRun({ number: 2, conclusion: 'failure', startedAt: '2026-07-23T11:00:00Z', updatedAt: '2026-07-23T11:02:00Z' }), jobs: [] },
    ];

    const episodes = recoveryEpisodes(entries);

    expect(episodes).toHaveLength(1);
    expect(episodes[0].to).toBeNull();
    expect(episodes[0].hours).toBeNull();
  });

  it('ignores cancelled and skipped runs, which resolve nothing', () => {
    const entries: RunWithJobs[] = [
      { run: buildRun({ number: 1, conclusion: 'failure', startedAt: '2026-07-23T10:00:00Z', updatedAt: '2026-07-23T10:02:00Z' }), jobs: [] },
      { run: buildRun({ number: 2, conclusion: 'cancelled', startedAt: '2026-07-23T11:00:00Z', updatedAt: '2026-07-23T11:02:00Z' }), jobs: [] },
      { run: buildRun({ number: 3, conclusion: 'success', startedAt: '2026-07-23T12:02:00Z', updatedAt: '2026-07-23T12:02:00Z' }), jobs: [] },
    ];

    const episodes = recoveryEpisodes(entries);

    expect(episodes).toHaveLength(1);
    expect(episodes[0].runNumbers).toEqual([1]);
    expect(episodes[0].hours).toBe(2);
  });
});

describe('findPublications', () => {
  const publishSuccess = buildJob('Publication GHCR', 'success', '2026-07-24T09:25:00Z', '2026-07-24T09:27:00Z');

  it('measures the lead time from the commit to the end of the publication', () => {
    const entries: RunWithJobs[] = [
      {
        run: buildRun({
          number: 1,
          conclusion: 'success',
          startedAt: '2026-07-24T09:24:00Z',
          updatedAt: '2026-07-24T09:27:00Z',
          committedAt: '2026-07-24T09:22:00Z',
        }),
        jobs: [publishSuccess],
      },
    ];

    const publications = findPublications(entries);

    expect(publications).toHaveLength(1);
    expect(publications[0].leadTimeMinutes).toBe(5);
  });

  it('does not count a failed or skipped publication as a publication', () => {
    const entries: RunWithJobs[] = [
      {
        run: buildRun({ number: 1, conclusion: 'failure', startedAt: '2026-07-24T09:24:00Z', updatedAt: '2026-07-24T09:27:00Z' }),
        jobs: [buildJob('Publication GHCR', 'failure', '2026-07-24T09:25:00Z', '2026-07-24T09:26:00Z')],
      },
      {
        run: buildRun({ number: 2, conclusion: 'success', startedAt: '2026-07-24T10:24:00Z', updatedAt: '2026-07-24T10:27:00Z' }),
        jobs: [buildJob('Publication GHCR', 'skipped', '2026-07-24T10:25:00Z', '2026-07-24T10:25:00Z')],
      },
    ];

    expect(findPublications(entries)).toHaveLength(0);
  });

  it('reports a null lead time when the API exposes no commit', () => {
    const entries: RunWithJobs[] = [
      {
        run: buildRun({
          number: 1,
          conclusion: 'success',
          startedAt: '2026-07-24T09:24:00Z',
          updatedAt: '2026-07-24T09:27:00Z',
          committedAt: null,
        }),
        jobs: [publishSuccess],
      },
    ];

    expect(findPublications(entries)[0].leadTimeMinutes).toBeNull();
  });
});

describe('firstFailureSignalSeconds', () => {
  it('returns the delay until the earliest failing job', () => {
    const entry: RunWithJobs = {
      run: buildRun({ number: 1, conclusion: 'failure', startedAt: '2026-07-27T17:54:00Z', updatedAt: '2026-07-27T17:55:00Z' }),
      jobs: [
        buildJob('Front', 'failure', '2026-07-27T17:54:05Z', '2026-07-27T17:54:20Z'),
        buildJob('Back', 'failure', '2026-07-27T17:54:05Z', '2026-07-27T17:54:12Z'),
        buildJob('Sonar', 'skipped', '2026-07-27T17:54:05Z', '2026-07-27T17:54:05Z'),
      ],
    };

    expect(firstFailureSignalSeconds(entry)).toBe(12);
  });

  it('returns null for a green run', () => {
    const entry: RunWithJobs = {
      run: buildRun({ number: 1, conclusion: 'success', startedAt: '2026-07-27T17:54:00Z', updatedAt: '2026-07-27T17:55:00Z' }),
      jobs: [buildJob('Back', 'success', '2026-07-27T17:54:05Z', '2026-07-27T17:54:30Z')],
    };

    expect(firstFailureSignalSeconds(entry)).toBeNull();
  });
});

describe('computeMetrics', () => {
  const entries: RunWithJobs[] = [
    {
      run: buildRun({ number: 1, conclusion: 'failure', startedAt: '2026-07-23T10:00:00Z', updatedAt: '2026-07-23T10:02:00Z' }),
      jobs: [buildJob('Back', 'failure', '2026-07-23T10:00:30Z', '2026-07-23T10:01:00Z')],
    },
    {
      run: buildRun({ number: 2, conclusion: 'success', startedAt: '2026-07-23T11:00:00Z', updatedAt: '2026-07-23T11:02:00Z' }),
      jobs: [buildJob('Back', 'success', '2026-07-23T11:00:30Z', '2026-07-23T11:01:00Z')],
    },
    {
      run: buildRun({ number: 3, conclusion: 'failure', event: 'schedule', startedAt: '2026-07-24T06:00:00Z', updatedAt: '2026-07-24T06:01:00Z' }),
      jobs: [buildJob('Audit des dépendances', 'failure', '2026-07-24T06:00:10Z', '2026-07-24T06:00:20Z')],
    },
  ];

  it('splits the run count by trigger', () => {
    const metrics = computeMetrics(entries);

    expect(metrics.runCount).toBe(3);
    expect(metrics.pushCount).toBe(2);
    expect(metrics.scheduleCount).toBe(1);
    expect(metrics.mergedPullRequestCount).toBe(0);
  });

  it('computes the change failure rate on pushes only', () => {
    const metrics = computeMetrics(entries);

    // 1 push rouge sur 2 pushes : le nightly n'entre pas dans ce périmètre
    expect(metrics.changeFailureRatePipeline).toBe(0.5);
    expect(metrics.failedPushNumbers).toEqual([1]);
  });

  it('reports no publication and no lead time when nothing was published', () => {
    const metrics = computeMetrics(entries);

    expect(metrics.publications).toHaveLength(0);
    expect(metrics.publicationsPerDay).toBeNull();
    expect(metrics.leadTimeMedianMinutes).toBeNull();
  });

  it('measures the duration of green pushes only', () => {
    const metrics = computeMetrics(entries);

    expect(metrics.pipelineDurationMedianSeconds).toBe(120);
    expect(metrics.greenPushCount).toBe(1);
  });

  it('throws on an empty history rather than returning meaningless zeros', () => {
    expect(() => computeMetrics([])).toThrow();
  });
});

describe('isMergedPullRequest', () => {
  const entry = (title: string): RunWithJobs => ({
    run: buildRun({ number: 1, conclusion: 'success', startedAt: '2026-08-04T08:00:00Z', updatedAt: '2026-08-04T08:03:00Z', title }),
    jobs: [],
  });

  it('recognises the merge commit GitHub writes when a pull request is merged', () => {
    expect(isMergedPullRequest(entry('Merge pull request #20 from EnhydraV/dependabot/npm_and_yarn/tools'))).toBe(true);
  });

  // Sans le numéro, c'est une fusion de branche ordinaire : la confondre avec
  // une PR gonflerait la part des changements passés par une relecture.
  it('does not mistake an ordinary branch merge for a pull request', () => {
    expect(isMergedPullRequest(entry("Merge remote-tracking branch 'origin/main'"))).toBe(false);
    expect(isMergedPullRequest(entry('Merge pull request from a fork'))).toBe(false);
  });

  it('treats a plain commit as a direct push', () => {
    expect(isMergedPullRequest(entry('docs: convert section references to links'))).toBe(false);
  });
});
