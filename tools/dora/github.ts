/** Récupération de l'historique des exécutions via l'API GitHub Actions. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunWithJobs, WorkflowJob, WorkflowRun } from './types.js';

const API = 'https://api.github.com';

export interface FetchOptions {
  repo: string;
  cacheDir: string;
  refresh: boolean;
}

/**
 * Cache disque des réponses : l'API non authentifiée est limitée à 60 requêtes
 * par heure, or un historique de N runs coûte N+1 requêtes. `GITHUB_TOKEN`
 * (optionnel) relève la limite.
 */
async function fetchJson<T>(url: string, cacheKey: string, options: FetchOptions): Promise<T> {
  const cacheFile = join(options.cacheDir, `${cacheKey}.json`);
  if (!options.refresh && existsSync(cacheFile)) {
    return JSON.parse(readFileSync(cacheFile, 'utf8')) as T;
  }

  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const hint = response.status === 403 ? ' (limite de requêtes atteinte ? définir GITHUB_TOKEN)' : '';
    throw new Error(`${url} → HTTP ${response.status}${hint}`);
  }

  const data = (await response.json()) as T;
  mkdirSync(options.cacheDir, { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(data));
  return data;
}

/** Runs de la branche `main` (celle qui livre), du plus ancien au plus récent. */
export async function fetchRunsWithJobs(options: FetchOptions): Promise<RunWithJobs[]> {
  const { workflow_runs } = await fetchJson<{ workflow_runs: WorkflowRun[] }>(
    `${API}/repos/${options.repo}/actions/runs?per_page=100`,
    'runs',
    options
  );

  const runs = workflow_runs
    .filter((run) => run.head_branch === 'main')
    .sort((a, b) => Date.parse(a.run_started_at) - Date.parse(b.run_started_at));

  const result: RunWithJobs[] = [];
  for (const run of runs) {
    const { jobs } = await fetchJson<{ jobs: WorkflowJob[] }>(
      `${API}/repos/${options.repo}/actions/runs/${run.id}/jobs`,
      `jobs-${run.id}`,
      options
    );
    result.push({ run, jobs });
  }
  return result;
}
