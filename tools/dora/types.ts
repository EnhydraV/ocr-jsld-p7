/** Structures partagées par les modules de calcul des métriques du pipeline. */

/** Sous-ensemble utilisé de l'objet « workflow run » de l'API GitHub Actions. */
export interface WorkflowRun {
  id: number;
  run_number: number;
  event: string;
  head_branch: string;
  head_sha: string;
  conclusion: string | null;
  run_started_at: string;
  updated_at: string;
  display_title: string;
  // Présent dans la réponse de l'API : évite d'avoir besoin du dépôt git local
  head_commit: { timestamp: string; message: string } | null;
}

/** Sous-ensemble utilisé de l'objet « job ». */
export interface WorkflowJob {
  id: number;
  name: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
}

/** Un run et ses jobs, seule structure manipulée par les calculs. */
export interface RunWithJobs {
  run: WorkflowRun;
  jobs: WorkflowJob[];
}

/**
 * Publication d'images réussie : le changement devient **installable**, ce qui
 * n'est pas la même chose que déployé (aucun environnement de production dans ce
 * projet). C'est le proxy assumé des métriques DORA — cf. DOCUMENTATION.md § 6.1.
 */
export interface Publication {
  run: WorkflowRun;
  publishedAt: string;
  leadTimeMinutes: number | null;
}

/** Épisode d'indisponibilité : du run rouge au run vert qui rétablit. */
export interface Episode {
  from: string;
  to: string | null;
  hours: number | null;
  runNumbers: number[];
}

export interface JobStat {
  name: string;
  medianSeconds: number;
  executions: number;
}

export interface Metrics {
  periodStart: string;
  periodEnd: string;
  windowDays: number;
  runCount: number;
  pushCount: number;
  scheduleCount: number;
  pullRequestCount: number;
  publications: Publication[];
  publicationWindowDays: number;
  publicationsPerDay: number | null;
  leadTimeMedianMinutes: number | null;
  leadTimeMeanMinutes: number | null;
  episodesAllEvents: Episode[];
  episodesPushOnly: Episode[];
  changeFailureRatePipeline: number;
  failedPushNumbers: number[];
  greenPushCount: number;
  pipelineDurationMedianSeconds: number;
  pipelineDurationMinSeconds: number;
  pipelineDurationMaxSeconds: number;
  firstFailureSignalMedianSeconds: number | null;
  successRate: number;
  jobStats: JobStat[];
}
