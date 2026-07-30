/**
 * Calcul des 4 métriques DORA et des KPI du pipeline.
 * Les définitions retenues sont justifiées dans DOCUMENTATION.md § 6.1.
 */
import type { Publication, Episode, JobStat, Metrics, RunWithJobs, WorkflowJob } from './types.js';

// Job qui rend une version installable : dernier événement observable du pipeline
export const PUBLISH_JOB = 'Publication GHCR';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export const durationSeconds = (from: string | null, to: string | null): number =>
  from && to ? (Date.parse(to) - Date.parse(from)) / 1000 : 0;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const publishJob = (jobs: WorkflowJob[]): WorkflowJob | undefined =>
  jobs.find((job) => job.name.startsWith(PUBLISH_JOB));

/** Normalise le nom d'un job (« Back — lint, typecheck… » → « Back »). */
export const shortJobName = (name: string): string => name.split(' —')[0].split(' (')[0];

/**
 * Épisodes d'indisponibilité. Les runs rouges consécutifs appartiennent au même
 * épisode : sans cette règle, trois nuits rouges compteraient pour trois
 * incidents brefs au lieu d'un seul long, et le MTTR serait flatté.
 */
export function recoveryEpisodes(entries: RunWithJobs[]): Episode[] {
  const episodes: Episode[] = [];
  let current: Episode | null = null;

  for (const { run } of entries) {
    if (run.conclusion === 'failure') {
      if (current) current.runNumbers.push(run.run_number);
      else current = { from: run.updated_at, to: null, hours: null, runNumbers: [run.run_number] };
    } else if (run.conclusion === 'success' && current) {
      current.to = run.updated_at;
      current.hours = (Date.parse(run.updated_at) - Date.parse(current.from)) / HOUR_MS;
      episodes.push(current);
      current = null;
    }
  }
  // Épisode encore ouvert : le pipeline est rouge à l'instant du calcul
  if (current) episodes.push(current);
  return episodes;
}

/** Publications, avec le lead time mesuré du commit à la fin de la publication. */
export function findPublications(entries: RunWithJobs[]): Publication[] {
  return entries.flatMap(({ run, jobs }) => {
    const job = publishJob(jobs);
    if (job?.conclusion !== 'success' || !job.completed_at) return [];

    const committedAt = run.head_commit?.timestamp ?? null;
    const leadTimeMinutes = committedAt
      ? (Date.parse(job.completed_at) - Date.parse(committedAt)) / 60_000
      : null;
    return [{ run, publishedAt: job.completed_at, leadTimeMinutes }];
  });
}

/** Temps écoulé entre le début du run et le premier job tombé en échec. */
export function firstFailureSignalSeconds(entry: RunWithJobs): number | null {
  const failed = entry.jobs.filter((job) => job.conclusion === 'failure' && job.completed_at);
  if (failed.length === 0) return null;
  return Math.min(...failed.map((job) => durationSeconds(entry.run.run_started_at, job.completed_at)));
}

function jobStatistics(entries: RunWithJobs[]): JobStat[] {
  const durations = new Map<string, number[]>();
  for (const { jobs } of entries) {
    for (const job of jobs) {
      if (job.conclusion !== 'success') continue;
      const name = shortJobName(job.name);
      durations.set(name, [...(durations.get(name) ?? []), durationSeconds(job.started_at, job.completed_at)]);
    }
  }
  return [...durations.entries()]
    .map(([name, values]) => ({ name, medianSeconds: median(values), executions: values.length }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function computeMetrics(entries: RunWithJobs[]): Metrics {
  if (entries.length === 0) throw new Error('Aucune exécution à analyser');

  const pushEntries = entries.filter((entry) => entry.run.event === 'push');
  const greenPush = pushEntries.filter((entry) => entry.run.conclusion === 'success');
  const failedPush = pushEntries.filter((entry) => entry.run.conclusion === 'failure');
  const publications = findPublications(entries);

  const periodStart = entries[0].run.run_started_at;
  const periodEnd = entries[entries.length - 1].run.updated_at;
  const publicationWindowDays =
    publications.length > 0 ? (Date.parse(periodEnd) - Date.parse(publications[0].publishedAt)) / DAY_MS : 0;

  const leadTimes = publications
    .map((publication) => publication.leadTimeMinutes)
    .filter((value): value is number => value !== null);

  const greenDurations = greenPush.map((entry) => durationSeconds(entry.run.run_started_at, entry.run.updated_at));
  const failureSignals = entries
    .map(firstFailureSignalSeconds)
    .filter((value): value is number => value !== null);

  return {
    periodStart,
    periodEnd,
    windowDays: (Date.parse(periodEnd) - Date.parse(periodStart)) / DAY_MS,
    runCount: entries.length,
    pushCount: pushEntries.length,
    scheduleCount: entries.filter((entry) => entry.run.event === 'schedule').length,
    pullRequestCount: entries.filter((entry) => entry.run.event === 'pull_request').length,
    publications,
    publicationWindowDays,
    publicationsPerDay: publicationWindowDays > 0 ? publications.length / publicationWindowDays : null,
    leadTimeMedianMinutes: leadTimes.length > 0 ? median(leadTimes) : null,
    leadTimeMeanMinutes: leadTimes.length > 0 ? mean(leadTimes) : null,
    episodesAllEvents: recoveryEpisodes(entries),
    episodesPushOnly: recoveryEpisodes(pushEntries),
    changeFailureRatePipeline: pushEntries.length > 0 ? failedPush.length / pushEntries.length : 0,
    failedPushNumbers: failedPush.map((entry) => entry.run.run_number),
    greenPushCount: greenPush.length,
    pipelineDurationMedianSeconds: median(greenDurations),
    pipelineDurationMinSeconds: greenDurations.length > 0 ? Math.min(...greenDurations) : 0,
    pipelineDurationMaxSeconds: greenDurations.length > 0 ? Math.max(...greenDurations) : 0,
    firstFailureSignalMedianSeconds: failureSignals.length > 0 ? median(failureSignals) : null,
    successRate: entries.filter((entry) => entry.run.conclusion === 'success').length / entries.length,
    jobStats: jobStatistics(entries),
  };
}
