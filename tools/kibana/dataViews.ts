/** Création idempotente des data views nécessaires aux dashboards. */
import { kibanaJson } from './client.js';

export interface DataViewSpec {
  /**
   * Identifiant IMPOSÉ, et non généré : les panneaux du dashboard référencent la
   * data view par son id. Laisser Kibana tirer un UUID rend le NDJSON non
   * portable (import en « missing_references », constaté).
   */
  id: string;
  title: string;
  name: string;
  timeFieldName: string;
}

/** Les deux natures de mesure restent séparées (§ 6.2) : une data view chacune. */
export const DATA_VIEWS: DataViewSpec[] = [
  { id: 'orion-logs', title: 'orion-logs-*', name: 'Logs applicatifs Orion', timeFieldName: '@timestamp' },
  {
    id: 'orion-pipeline-metrics',
    title: 'orion-pipeline-metrics',
    name: 'Métriques du pipeline CI/CD',
    timeFieldName: '@timestamp',
  },
];

interface DataViewList {
  data_view: { id: string; title: string }[];
}

export async function ensureDataView(spec: DataViewSpec): Promise<'created' | 'existing'> {
  const existing = await kibanaJson<DataViewList>('/api/data_views');
  if (existing.data_view.some((view) => view.id === spec.id)) return 'existing';

  await kibanaJson('/api/data_views/data_view', {
    method: 'POST',
    body: JSON.stringify({ data_view: spec }),
  });
  return 'created';
}
