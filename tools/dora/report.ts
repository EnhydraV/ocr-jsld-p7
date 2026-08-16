/** Rapport texte des métriques, destiné à la rédaction de DOCUMENTATION.md § 6. */
import { mean, median } from './metrics.js';
import type { Episode, Metrics } from './types.js';

const formatHours = (hours: number): string =>
  hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toFixed(1)} h`;

const percent = (ratio: number): string => `${(ratio * 100).toFixed(1)} %`;

function episodeLines(label: string, episodes: Episode[]): string[] {
  const closed = episodes.filter((episode) => episode.hours !== null).map((episode) => episode.hours as number);
  const lines = [
    `- ${label} : ${episodes.length} épisode(s) — moyenne ${formatHours(mean(closed))}, ` +
      `médiane ${formatHours(median(closed))}`,
  ];
  for (const episode of episodes) {
    lines.push(
      `  - runs #${episode.runNumbers.join(', #')} : ` +
        `${episode.hours === null ? 'non résolu à ce jour' : formatHours(episode.hours)}`
    );
  }
  return lines;
}

export function buildReport(metrics: Metrics, repo: string, workflowPath = ''): string {
  const lines: string[] = [
    `# Métriques du pipeline — ${repo}`,
    '',
    // Le périmètre fait partie du résultat : sans lui, un lecteur ne peut pas
    // savoir que les runs « Dependabot Updates » sont écartés.
    ...(workflowPath ? [`Workflow mesuré : ${workflowPath}`, ''] : []),
    `Période : ${metrics.periodStart} → ${metrics.periodEnd} (${metrics.windowDays.toFixed(2)} jours) · ` +
      `${metrics.runCount} runs sur main (${metrics.pushCount} push, ${metrics.scheduleCount} nightly, ` +
      `${metrics.pullRequestCount} pull request)`,
    '',
    '## 1. Deployment Frequency — mesurée comme fréquence de LIVRAISON',
    '   (proxy assumé : aucun environnement de production, cf. § 6.1)',
    `- Publications d'images réussies : ${metrics.publications.length}`,
    `- Depuis la 1re publication : ${metrics.publicationWindowDays.toFixed(2)} jours`,
    `- Fréquence : ${metrics.publicationsPerDay === null ? 'n/a' : metrics.publicationsPerDay.toFixed(2)} par jour`,
    `- Indicateur complémentaire — pushes intégralement verts : ${metrics.greenPushCount}/${metrics.pushCount}`,
    '',
    '## 2. Lead Time for Changes — mesuré jusqu\'à la mise à DISPOSITION',
  ];

  for (const publication of metrics.publications) {
    lines.push(
      `- ${publication.run.head_sha.slice(0, 7)} « ${publication.run.display_title.slice(0, 45)} » : ` +
        `${publication.leadTimeMinutes === null ? 'n/a' : `${publication.leadTimeMinutes.toFixed(1)} min`} ` +
        `(commit ${publication.run.head_commit?.timestamp ?? '?'} → publication ${publication.publishedAt})`
    );
  }
  if (metrics.leadTimeMedianMinutes !== null) {
    lines.push(
      `- Médiane : ${metrics.leadTimeMedianMinutes.toFixed(1)} min · ` +
        `Moyenne : ${(metrics.leadTimeMeanMinutes ?? 0).toFixed(1)} min`
    );
  }

  lines.push(
    '',
    '## 3. MTTR — mesuré comme rétablissement du PIPELINE',
    ...episodeLines('tous événements', metrics.episodesAllEvents),
    ...episodeLines('pushes uniquement', metrics.episodesPushOnly),
    '',
    '## 4. Change Failure Rate',
    `- Périmètre pipeline : ${metrics.failedPushNumbers.length}/${metrics.pushCount} = ` +
      `${percent(metrics.changeFailureRatePipeline)}`,
    `  (runs rouges : #${metrics.failedPushNumbers.join(', #')})`,
    "- Périmètre déploiement : NON MESURABLE (aucun service en production à observer) ; " +
      `les ${metrics.publications.length} publication(s) ont en revanche toutes été précédées d'un smoke test vert`,
    '',
    '## 5. KPI',
    `- Durée d'un pipeline vert : médiane ${metrics.pipelineDurationMedianSeconds.toFixed(0)} s ` +
      `(min ${metrics.pipelineDurationMinSeconds.toFixed(0)} s, max ${metrics.pipelineDurationMaxSeconds.toFixed(0)} s)`,
    `- Temps avant le 1er signal d'échec : médiane ` +
      `${metrics.firstFailureSignalMedianSeconds === null ? 'n/a' : `${metrics.firstFailureSignalMedianSeconds.toFixed(0)} s`}`,
    `- Taux de réussite des runs : ${percent(metrics.successRate)}`
  );

  for (const job of metrics.jobStats) {
    lines.push(`- Job « ${job.name} » : médiane ${job.medianSeconds.toFixed(0)} s sur ${job.executions} exécutions`);
  }

  return lines.join('\n');
}
