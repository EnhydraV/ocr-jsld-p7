/**
 * Indexation générique dans Elasticsearch, partagée par les projections de
 * l'API GitHub (métriques du pipeline, alertes Dependabot). Chaque domaine
 * fournit son mapping et ses documents ; l'idempotence (_id stable) et la
 * reconstruction sur mapping périmé sont communes.
 */

export interface IndexMapping {
  mappings: { properties: Record<string, { type: string }> };
}

export interface BulkDocument {
  id: string;
  body: Record<string, unknown>;
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
 * « Fielddata is disabled on [message] ». Comme ces index ne sont que des
 * **projections** de l'API GitHub, entièrement reconstruites par la commande,
 * on les recrée au lieu de laisser l'utilisateur deviner.
 */
async function findStaleFields(baseUrl: string, index: string, mapping: IndexMapping): Promise<string[]> {
  const response = await fetch(`${baseUrl}/${index}/_mapping`);
  if (!response.ok) return [];

  const body = (await response.json()) as MappingResponse;
  const actual = body[index]?.mappings?.properties ?? {};
  return Object.entries(mapping.mappings.properties)
    .filter(([field, spec]) => actual[field] && actual[field].type !== spec.type)
    .map(([field]) => field);
}

async function ensureIndex(baseUrl: string, index: string, mapping: IndexMapping): Promise<void> {
  const existing = await fetch(`${baseUrl}/${index}`, { method: 'HEAD' });
  if (existing.ok) {
    const stale = await findStaleFields(baseUrl, index, mapping);
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
    body: JSON.stringify(mapping),
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
  index: string,
  mapping: IndexMapping
): Promise<IndexResult> {
  await ensureIndex(baseUrl, index, mapping);

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
