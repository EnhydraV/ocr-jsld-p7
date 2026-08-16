/**
 * Indexation des métriques du pipeline dans Elasticsearch, pour les visualiser
 * dans Kibana à côté des métriques applicatives (index séparé : les deux
 * natures de mesure ne se mélangent pas, cf. DOCUMENTATION.md § 6.2).
 */
import {
  buildBulkBody as buildGenericBulkBody,
  indexDocuments as indexGenericDocuments,
  type BulkDocument,
  type IndexResult,
} from '../elastic.js';
import { durationSeconds, firstFailureSignalSeconds, shortJobName } from './metrics.js';
import type { Metrics, RunWithJobs } from './types.js';

export const DEFAULT_INDEX = 'orion-pipeline-metrics';

/** Mapping explicite : évite qu'Elasticsearch déduise des types incohérents. */
const MAPPING = {
  mappings: {
    properties: {
      '@timestamp': { type: 'date' },
      doc_type: { type: 'keyword' },
      event: { type: 'keyword' },
      conclusion: { type: 'keyword' },
      run_number: { type: 'integer' },
      sha: { type: 'keyword' },
      // keyword et non text : le message sert à grouper et à afficher dans un
      // tableau, pas à faire de la recherche plein texte (un champ `text` seul
      // n'est pas agrégeable — panneau vide constaté)
      message: { type: 'keyword', ignore_above: 512 },
      duration_s: { type: 'float' },
      is_publication: { type: 'boolean' },
      // 0/1 plutôt qu'un booléen : la moyenne d'un indicateur numérique EST le
      // taux, ce qui donne le CFR avec une simple agrégation `average`, sans
      // formule Lens. Type `long` et non `byte` : sur un index déjà créé, le
      // champ est ajouté par le mapping dynamique d'Elasticsearch, qui déduit
      // `long` — déclarer autre chose ferait voir un mapping périmé au run
      // suivant et provoquerait une reconstruction inutile (cf. elastic.ts).
      is_failure: { type: 'long' },
      lead_time_min: { type: 'float' },
      first_failure_signal_s: { type: 'float' },
      job_name: { type: 'keyword' },
      recovery_hours: { type: 'float' },
      resolved: { type: 'boolean' },
      run_numbers: { type: 'integer' },
    },
  },
} as const;

/**
 * Un document par run, par job et par épisode. Kibana dérive les métriques par
 * agrégation (fréquence = compte des runs déployés, MTTR = médiane des épisodes,
 * CFR = ratio de conclusions), plutôt que de stocker des valeurs pré-calculées
 * qui se périmeraient.
 */
export function buildDocuments(entries: RunWithJobs[], metrics: Metrics): BulkDocument[] {
  const publicationsByRunId = new Map(metrics.publications.map((publication) => [publication.run.id, publication]));
  const documents: BulkDocument[] = [];

  for (const entry of entries) {
    const { run, jobs } = entry;
    const publication = publicationsByRunId.get(run.id);

    documents.push({
      id: `run-${run.id}`,
      body: {
        '@timestamp': run.run_started_at,
        doc_type: 'run',
        run_number: run.run_number,
        event: run.event,
        conclusion: run.conclusion,
        sha: run.head_sha,
        message: run.display_title,
        duration_s: durationSeconds(run.run_started_at, run.updated_at),
        is_publication: publication !== undefined,
        // Même prédicat que `changeFailureRatePipeline` (metrics.ts) : le
        // dashboard et le rapport texte ne peuvent pas diverger.
        is_failure: run.conclusion === 'failure' ? 1 : 0,
        lead_time_min: publication?.leadTimeMinutes ?? null,
        first_failure_signal_s: firstFailureSignalSeconds(entry),
      },
    });

    for (const job of jobs) {
      if (!job.started_at) continue;
      documents.push({
        id: `job-${job.id}`,
        body: {
          '@timestamp': job.started_at,
          doc_type: 'job',
          job_name: shortJobName(job.name),
          conclusion: job.conclusion,
          duration_s: durationSeconds(job.started_at, job.completed_at),
          run_number: run.run_number,
          event: run.event,
        },
      });
    }
  }

  for (const episode of metrics.episodesAllEvents) {
    documents.push({
      id: `episode-${episode.from}`,
      body: {
        '@timestamp': episode.from,
        doc_type: 'episode',
        recovery_hours: episode.hours,
        resolved: episode.to !== null,
        run_numbers: episode.runNumbers,
      },
    });
  }

  return documents;
}

/** Corps NDJSON de l'API _bulk (logique commune dans ../elastic.ts). */
export function buildBulkBody(documents: BulkDocument[], index: string): string {
  return buildGenericBulkBody(documents, index);
}

export type { IndexResult };

export async function indexDocuments(
  documents: BulkDocument[],
  baseUrl: string,
  index: string
): Promise<IndexResult> {
  return indexGenericDocuments(documents, baseUrl, index, MAPPING);
}
