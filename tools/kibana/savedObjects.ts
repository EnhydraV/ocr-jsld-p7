/**
 * Import / export des objets sauvegardés Kibana (dashboards, visualisations Lens,
 * recherches, data views), pour que les dashboards soient **versionnés** dans le
 * dépôt plutôt que reconstruits à la main.
 */
import { kibanaRequest } from './client.js';

/** Types exportés : un dashboard seul est inutile sans ses visualisations. */
const EXPORTED_TYPES = ['dashboard', 'lens', 'visualization', 'search', 'index-pattern'];

export interface ImportSummary {
  success: boolean;
  successCount: number;
  errors: { id: string; type: string; error: { type: string } }[];
}

/**
 * `overwrite=true` : réimporter met à jour au lieu d'échouer sur des conflits,
 * ce qui rend la commande rejouable.
 */
export async function importObjects(ndjson: string, fileName = 'kibana-objects.ndjson'): Promise<ImportSummary> {
  const form = new FormData();
  form.append('file', new Blob([ndjson], { type: 'application/ndjson' }), fileName);

  const response = await kibanaRequest('/api/saved_objects/_import?overwrite=true', {
    method: 'POST',
    body: form,
  });
  return (await response.json()) as ImportSummary;
}

export interface CreatableObject {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  references: { id: string; name: string; type: string }[];
}

/**
 * Création directe, objet par objet. Préférée à l'API d'import pour les objets
 * décrits en code : l'import applique la chaîne de migrations des versions
 * antérieures, qui échoue sur un document dépourvu de métadonnées de version
 * (« Cannot read properties of undefined (reading 'currentIndexPatternId') »).
 * L'API d'import reste utilisée pour un NDJSON exporté d'un Kibana réel.
 */
export async function createObjects(objects: CreatableObject[]): Promise<number> {
  let created = 0;
  for (const object of objects) {
    await kibanaRequest(`/api/saved_objects/${object.type}/${object.id}?overwrite=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attributes: object.attributes, references: object.references }),
    });
    created += 1;
  }
  return created;
}

/** Export NDJSON de tous les dashboards et de leurs dépendances. */
export async function exportDashboards(): Promise<string> {
  const response = await kibanaRequest('/api/saved_objects/_export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: EXPORTED_TYPES,
      includeReferencesDeep: true,
      excludeExportDetails: true,
    }),
  });
  return await response.text();
}
