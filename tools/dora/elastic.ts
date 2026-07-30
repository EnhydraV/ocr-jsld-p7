/**
 * Indexation des métriques du pipeline dans Elasticsearch, pour les visualiser
 * dans Kibana à côté des métriques applicatives (index séparé : les deux
 * natures de mesure ne se mélangent pas, cf. DOCUMENTATION.md § 6.2).
 */
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
      lead_time_min: { type: 'float' },
      first_failure_signal_s: { type: 'float' },
      job_name: { type: 'keyword' },
      recovery_hours: { type: 'float' },
      resolved: { type: 'boolean' },
      run_numbers: { type: 'integer' },
    },
  },
} as const;

interface BulkDocument {
  id: string;
  body: Record<string, unknown>;
}

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

/** Corps NDJSON de l'API _bulk. L'`_id` stable rend l'indexation idempotente. */
export function buildBulkBody(documents: BulkDocument[], index: string): string {
  return (
    documents
      .flatMap((document) => [
        JSON.stringify({ index: { _index: index, _id: document.id } }),
        JSON.stringify(document.body),
      ])
      .join('\n') + '\n'
  );
}

interface MappingResponse {
  [index: string]: { mappings?: { properties?: Record<string, { type?: string }> } };
}

/**
 * Un mapping périmé se paie cher et tard : un champ passé de `text` à `keyword`
 * ne se met pas à jour en place, et le panneau Kibana correspondant échoue avec
 * « Fielddata is disabled on [message] ». Comme cet index n'est qu'une
 * **projection** de l'API GitHub, entièrement reconstruite par cette commande,
 * on le recrée au lieu de laisser l'utilisateur deviner.
 */
async function findStaleFields(baseUrl: string, index: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/${index}/_mapping`);
  if (!response.ok) return [];

  const body = (await response.json()) as MappingResponse;
  const actual = body[index]?.mappings?.properties ?? {};
  return Object.entries(MAPPING.mappings.properties)
    .filter(([field, spec]) => actual[field] && actual[field].type !== spec.type)
    .map(([field]) => field);
}

async function ensureIndex(baseUrl: string, index: string): Promise<void> {
  const existing = await fetch(`${baseUrl}/${index}`, { method: 'HEAD' });
  if (existing.ok) {
    const stale = await findStaleFields(baseUrl, index);
    if (stale.length === 0) return;

    console.warn(`Mapping périmé sur ${stale.join(', ')} — index ${index} reconstruit.`);
    const deleted = await fetch(`${baseUrl}/${index}?master_timeout=120s`, { method: 'DELETE' });
    if (!deleted.ok) {
      throw new Error(`Suppression de l'index ${index} → HTTP ${deleted.status} ${await deleted.text()}`);
    }
  }

  // master_timeout généreux : sur un nœud unique au disque lent, la création
  // d'index peut expirer derrière la file d'attente du maître (503 observé)
  const created = await fetch(`${baseUrl}/${index}?master_timeout=120s`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(MAPPING),
  });
  if (!created.ok) {
    throw new Error(`Création de l'index ${index} → HTTP ${created.status} ${await created.text()}`);
  }
}

export interface IndexResult {
  documents: number;
  errors: number;
}

export async function indexDocuments(
  documents: BulkDocument[],
  baseUrl: string,
  index: string
): Promise<IndexResult> {
  await ensureIndex(baseUrl, index);

  // refresh=wait_for : les documents sont visibles dès le retour de la commande.
  // Sans cela, ouvrir Kibana dans la seconde qui suit donne un dashboard vide.
  const response = await fetch(`${baseUrl}/_bulk?refresh=wait_for`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-ndjson' },
    body: buildBulkBody(documents, index),
  });
  if (!response.ok) {
    throw new Error(`Indexation → HTTP ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as { errors: boolean; items: Record<string, { error?: unknown }>[] };
  const errors = payload.items.filter((item) => Object.values(item).some((entry) => entry.error)).length;
  return { documents: documents.length, errors };
}
