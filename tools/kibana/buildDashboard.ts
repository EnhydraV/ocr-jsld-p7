/**
 * Construction des objets sauvegardés du dashboard « Pipeline CI/CD ».
 *
 * Le dashboard est ainsi **du code versionné** plutôt qu'une suite de clics : il
 * se recrée à l'identique sur n'importe quelle instance (`npm run kibana:setup`).
 * Chaque panneau est une visualisation Lens autonome référencée par le dashboard.
 *
 * Repère de lecture du format Lens : `datasourceStates.formBased.layers` décrit
 * les colonnes (agrégations), `visualization` décrit comment les afficher, et
 * `references` relie la couche à sa data view.
 */

const DATA_VIEW_ID = 'orion-pipeline-metrics';

/** Filtre KQL appliqué à un panneau entier (les champs sont partagés entre doc_type). */
interface PanelQuery {
  query: string;
}

interface SavedObject {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  references: { id: string; name: string; type: string }[];
}

const layerReference = (layerId: string) => ({
  id: DATA_VIEW_ID,
  name: `indexpattern-datasource-layer-${layerId}`,
  type: 'index-pattern',
});

/** Colonne d'agrégation simple (compte, médiane, moyenne…). */
function metricColumn(
  operationType: string,
  label: string,
  sourceField: string,
  format?: { id: string; params?: Record<string, unknown> }
): Record<string, unknown> {
  return {
    label,
    dataType: 'number',
    operationType,
    isBucketed: false,
    scale: 'ratio',
    ...(operationType === 'count' ? { sourceField: '___records___' } : { sourceField }),
    params: format ? { format } : {},
  };
}

/** Tuile chiffrée : une seule valeur, éventuellement formatée. */
function metricPanel(
  id: string,
  title: string,
  column: Record<string, unknown>,
  filter: PanelQuery
): SavedObject {
  const layerId = `layer-${id}`;
  return {
    id,
    type: 'lens',
    attributes: {
      title,
      visualizationType: 'lnsMetric',
      state: {
        datasourceStates: {
          formBased: { layers: { [layerId]: { columns: { metric: column }, columnOrder: ['metric'], incompleteColumns: {} } } },
        },
        visualization: { layerId, layerType: 'data', metricAccessor: 'metric' },
        filters: [],
        query: { query: filter.query, language: 'kuery' },
      },
    },
    references: [layerReference(layerId)],
  };
}

/** Graphique en barres : une métrique ventilée par un bucket (date ou terme). */
function barPanel(
  id: string,
  title: string,
  metric: Record<string, unknown>,
  bucket: Record<string, unknown>,
  filter: PanelQuery,
  horizontal = false
): SavedObject {
  const layerId = `layer-${id}`;
  return {
    id,
    type: 'lens',
    attributes: {
      title,
      visualizationType: 'lnsXY',
      state: {
        datasourceStates: {
          formBased: {
            layers: {
              [layerId]: {
                columns: { bucket, metric },
                columnOrder: ['bucket', 'metric'],
                incompleteColumns: {},
              },
            },
          },
        },
        visualization: {
          legend: { isVisible: false, position: 'right' },
          valueLabels: 'show',
          preferredSeriesType: horizontal ? 'bar_horizontal' : 'bar_stacked',
          layers: [
            {
              layerId,
              layerType: 'data',
              seriesType: horizontal ? 'bar_horizontal' : 'bar_stacked',
              xAccessor: 'bucket',
              accessors: ['metric'],
            },
          ],
        },
        filters: [],
        query: { query: filter.query, language: 'kuery' },
      },
    },
    references: [layerReference(layerId)],
  };
}

/** Table : plusieurs colonnes, utile pour lister les runs en échec. */
function tablePanel(
  id: string,
  title: string,
  columns: Record<string, Record<string, unknown>>,
  order: string[],
  filter: PanelQuery
): SavedObject {
  const layerId = `layer-${id}`;
  return {
    id,
    type: 'lens',
    attributes: {
      title,
      visualizationType: 'lnsDatatable',
      state: {
        datasourceStates: {
          formBased: { layers: { [layerId]: { columns, columnOrder: order, incompleteColumns: {} } } },
        },
        visualization: { layerId, layerType: 'data', columns: order.map((columnId) => ({ columnId })) },
        filters: [],
        query: { query: filter.query, language: 'kuery' },
      },
    },
    references: [layerReference(layerId)],
  };
}

const dateHistogram = (label = 'Date'): Record<string, unknown> => ({
  label,
  dataType: 'date',
  operationType: 'date_histogram',
  sourceField: '@timestamp',
  isBucketed: true,
  scale: 'interval',
  params: { interval: '1d', includeEmptyRows: true, dropPartials: false },
});

const termsColumn = (
  sourceField: string,
  label: string,
  size = 10,
  // Trier par une colonne exige que cette colonne existe dans la même couche :
  // l'ordre alphabétique évite cette dépendance quand il n'y a pas de « metric »
  orderBy: Record<string, unknown> = { type: 'column', columnId: 'metric' }
): Record<string, unknown> => ({
  label,
  dataType: 'string',
  operationType: 'terms',
  sourceField,
  isBucketed: true,
  scale: 'ordinal',
  params: {
    size,
    orderBy,
    orderDirection: 'desc',
    otherBucket: false,
    missingBucket: false,
    parentFormat: { id: 'terms' },
  },
});

/** Dernière valeur d'un champ dans le bucket (le plus récent selon @timestamp). */
const lastValueColumn = (sourceField: string, label: string): Record<string, unknown> => ({
  label,
  dataType: 'string',
  operationType: 'last_value',
  sourceField,
  isBucketed: false,
  scale: 'ordinal',
  params: { sortField: '@timestamp', showArrayValues: false },
});

/** Les 7 panneaux, dans l'ordre de lecture du dashboard. */
export function buildPanels(): SavedObject[] {
  return [
    metricPanel(
      'orion-pipeline-publications',
      'Publications (livraisons)',
      metricColumn('count', 'Publications', '___records___'),
      { query: 'doc_type: "run" and is_publication: true' }
    ),
    metricPanel(
      'orion-pipeline-leadtime',
      'Lead time médian (min)',
      metricColumn('median', 'Lead time médian (min)', 'lead_time_min', { id: 'number', params: { decimals: 1 } }),
      { query: 'doc_type: "run" and is_publication: true' }
    ),
    metricPanel(
      'orion-pipeline-mttr',
      'MTTR médian (h)',
      metricColumn('median', 'MTTR médian (h)', 'recovery_hours', { id: 'number', params: { decimals: 1 } }),
      { query: 'doc_type: "episode"' }
    ),
    metricPanel(
      'orion-pipeline-success-rate',
      'Runs verts',
      metricColumn('count', 'Runs verts', '___records___'),
      { query: 'doc_type: "run" and conclusion: "success"' }
    ),
    barPanel(
      'orion-pipeline-duration',
      'Durée des pipelines verts (s)',
      metricColumn('median', 'Durée médiane (s)', 'duration_s', { id: 'number', params: { decimals: 0 } }),
      dateHistogram('Jour'),
      { query: 'doc_type: "run" and event: "push" and conclusion: "success"' }
    ),
    barPanel(
      'orion-pipeline-jobs',
      'Durée médiane par job (s)',
      metricColumn('median', 'Durée médiane (s)', 'duration_s', { id: 'number', params: { decimals: 0 } }),
      termsColumn('job_name', 'Job'),
      { query: 'doc_type: "job" and conclusion: "success"' },
      true
    ),
    tablePanel(
      'orion-pipeline-failures',
      'Runs en échec (un par ligne)',
      {
        // Bucket sur run_number : une ligne par exécution. Grouper par message
        // fusionnerait les 4 nightlies, tous intitulés « CI » (constaté).
        run: termsColumn('run_number', 'Run', 30, { type: 'alphabetical' }),
        message: lastValueColumn('message', 'Commit'),
        event: lastValueColumn('event', 'Déclencheur'),
        signal: metricColumn('median', "1er signal d'échec (s)", 'first_failure_signal_s', {
          id: 'number',
          params: { decimals: 0 },
        }),
      },
      ['run', 'event', 'message', 'signal'],
      { query: 'doc_type: "run" and conclusion: "failure"' }
    ),
  ];
}

/** Disposition : 4 tuiles sur la 1re ligne, puis les graphiques, puis la table. */
const GRID = [
  { w: 12, h: 8, x: 0, y: 0 },
  { w: 12, h: 8, x: 12, y: 0 },
  { w: 12, h: 8, x: 24, y: 0 },
  { w: 12, h: 8, x: 36, y: 0 },
  { w: 24, h: 12, x: 0, y: 8 },
  { w: 24, h: 12, x: 24, y: 8 },
  { w: 48, h: 18, x: 0, y: 20 },
];

export function buildDashboard(panels: SavedObject[]): SavedObject {
  const panelsJSON = panels.map((panel, index) => ({
    type: 'lens',
    gridData: { ...GRID[index], i: `panel-${index}` },
    panelIndex: `panel-${index}`,
    embeddableConfig: {},
    panelRefName: `panel_${index}`,
    title: panel.attributes.title as string,
  }));

  return {
    id: 'orion-pipeline-dashboard',
    type: 'dashboard',
    attributes: {
      title: 'Pipeline CI/CD — métriques DORA',
      description:
        'Métriques DORA et KPI du pipeline (cf. DOCUMENTATION.md § 6). Données produites par « npm run dora:index ».',
      panelsJSON: JSON.stringify(panelsJSON),
      optionsJSON: JSON.stringify({ useMargins: true, syncColors: false, syncCursor: true, syncTooltips: false, hidePanelTitles: false }),
      version: 1,
      timeRestore: true,
      // Plage figée sur la période observée : sans cela, le dashboard s'ouvre
      // sur « les 15 dernières minutes » et paraît vide
      timeFrom: '2026-07-20T00:00:00.000Z',
      timeTo: 'now',
      kibanaSavedObjectMeta: {
        searchSourceJSON: JSON.stringify({ query: { query: '', language: 'kuery' }, filter: [] }),
      },
    },
    references: panels.map((panel, index) => ({ id: panel.id, name: `panel_${index}`, type: 'lens' })),
  };
}

/** NDJSON prêt pour l'API d'import (un objet par ligne). */
export function buildDashboardNdjson(): string {
  const panels = buildPanels();
  return [...panels, buildDashboard(panels)].map((object) => JSON.stringify(object)).join('\n') + '\n';
}
