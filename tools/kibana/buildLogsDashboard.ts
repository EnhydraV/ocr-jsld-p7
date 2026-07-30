/**
 * Objets sauvegardés du dashboard « Logs applicatifs » (index `orion-logs-*`).
 *
 * Séparé du dashboard pipeline (§ 6.2) : les deux natures de mesure ne se
 * mélangent pas. On y trouve les logs bruts du serveur et la même vue restreinte
 * aux réponses en erreur, la barre KQL du dashboard permettant d'affiner encore.
 */

const DATA_VIEW_ID = 'orion-logs';

/** Seuil d'erreur HTTP : 4xx (usage fautif) et 5xx (défaut serveur). */
export const ERROR_QUERY = 'status >= 400';

interface SavedObject {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  references: { id: string; name: string; type: string }[];
}

/** Colonnes affichées, dans l'ordre : l'essentiel d'une requête HTTP. */
// `message` est indispensable : les événements non HTTP (démarrage, erreurs
// applicatives) n'ont ni status ni url, tout leur contenu est dans ce champ.
const COLUMNS = ['status', 'method', 'url', 'responseTimeMs', 'level', 'message'];

/**
 * Recherche sauvegardée (type `search`) : c'est l'objet qui porte une vue de
 * documents bruts, contrairement à Lens qui agrège.
 */
function savedSearch(id: string, title: string, query: string): SavedObject {
  return {
    id,
    type: 'search',
    attributes: {
      title,
      description: '',
      columns: COLUMNS,
      sort: [['@timestamp', 'desc']],
      hideChart: false,
      isTextBasedQuery: false,
      kibanaSavedObjectMeta: {
        searchSourceJSON: JSON.stringify({
          query: { query, language: 'kuery' },
          filter: [],
          indexRefName: 'kibanaSavedObjectMeta.searchSourceJSON.index',
        }),
      },
    },
    references: [
      { id: DATA_VIEW_ID, name: 'kibanaSavedObjectMeta.searchSourceJSON.index', type: 'index-pattern' },
    ],
  };
}

/** Tuile Lens comptant les réponses en erreur. */
function errorCountPanel(): SavedObject {
  const layerId = 'layer-logs-errors';
  return {
    id: 'orion-logs-error-count',
    type: 'lens',
    attributes: {
      title: 'Réponses en erreur (status ≥ 400)',
      visualizationType: 'lnsMetric',
      state: {
        datasourceStates: {
          formBased: {
            layers: {
              [layerId]: {
                columns: {
                  metric: {
                    label: 'Réponses en erreur',
                    dataType: 'number',
                    operationType: 'count',
                    sourceField: '___records___',
                    isBucketed: false,
                    scale: 'ratio',
                    params: {},
                  },
                },
                columnOrder: ['metric'],
                incompleteColumns: {},
              },
            },
          },
        },
        visualization: { layerId, layerType: 'data', metricAccessor: 'metric' },
        filters: [],
        query: { query: ERROR_QUERY, language: 'kuery' },
      },
    },
    references: [
      { id: DATA_VIEW_ID, name: `indexpattern-datasource-layer-${layerId}`, type: 'index-pattern' },
    ],
  };
}

/** Répartition des statuts dans le temps : fait ressortir les pics d'erreurs. */
function statusOverTimePanel(): SavedObject {
  const layerId = 'layer-logs-status';
  return {
    id: 'orion-logs-status-over-time',
    type: 'lens',
    attributes: {
      title: 'Statuts HTTP dans le temps',
      visualizationType: 'lnsXY',
      state: {
        datasourceStates: {
          formBased: {
            layers: {
              [layerId]: {
                columns: {
                  bucket: {
                    label: 'Heure',
                    dataType: 'date',
                    operationType: 'date_histogram',
                    sourceField: '@timestamp',
                    isBucketed: true,
                    scale: 'interval',
                    params: { interval: 'auto', includeEmptyRows: true, dropPartials: false },
                  },
                  split: {
                    label: 'Statut',
                    dataType: 'number',
                    operationType: 'terms',
                    sourceField: 'status',
                    isBucketed: true,
                    scale: 'ordinal',
                    params: {
                      size: 10,
                      orderBy: { type: 'column', columnId: 'metric' },
                      orderDirection: 'desc',
                      otherBucket: false,
                      missingBucket: false,
                      parentFormat: { id: 'terms' },
                    },
                  },
                  metric: {
                    label: 'Requêtes',
                    dataType: 'number',
                    operationType: 'count',
                    sourceField: '___records___',
                    isBucketed: false,
                    scale: 'ratio',
                    params: {},
                  },
                },
                columnOrder: ['bucket', 'split', 'metric'],
                incompleteColumns: {},
              },
            },
          },
        },
        visualization: {
          legend: { isVisible: true, position: 'right' },
          valueLabels: 'hide',
          preferredSeriesType: 'bar_stacked',
          layers: [
            {
              layerId,
              layerType: 'data',
              seriesType: 'bar_stacked',
              xAccessor: 'bucket',
              splitAccessor: 'split',
              accessors: ['metric'],
            },
          ],
        },
        filters: [],
        query: { query: '', language: 'kuery' },
      },
    },
    references: [
      { id: DATA_VIEW_ID, name: `indexpattern-datasource-layer-${layerId}`, type: 'index-pattern' },
    ],
  };
}

/**
 * Temps de réponse au 95e centile : la moyenne masque les requêtes lentes, or
 * c'est la queue de distribution que subit l'utilisateur (§ 6.3).
 */
function latencyPanel(): SavedObject {
  const layerId = 'layer-logs-latency';
  return {
    id: 'orion-logs-latency',
    type: 'lens',
    attributes: {
      title: 'Temps de réponse p95 (ms)',
      visualizationType: 'lnsMetric',
      state: {
        datasourceStates: {
          formBased: {
            layers: {
              [layerId]: {
                columns: {
                  metric: {
                    label: 'p95 (ms)',
                    dataType: 'number',
                    operationType: 'percentile',
                    sourceField: 'responseTimeMs',
                    isBucketed: false,
                    scale: 'ratio',
                    params: { percentile: 95, format: { id: 'number', params: { decimals: 0 } } },
                  },
                },
                columnOrder: ['metric'],
                incompleteColumns: {},
              },
            },
          },
        },
        visualization: { layerId, layerType: 'data', metricAccessor: 'metric' },
        filters: [],
        query: { query: 'level: "http"', language: 'kuery' },
      },
    },
    references: [
      { id: DATA_VIEW_ID, name: `indexpattern-datasource-layer-${layerId}`, type: 'index-pattern' },
    ],
  };
}

/** Top des URL appelées : identifie les points d'entrée les plus sollicités. */
function topUrlsPanel(): SavedObject {
  const layerId = 'layer-logs-urls';
  return {
    id: 'orion-logs-top-urls',
    type: 'lens',
    attributes: {
      title: 'URL les plus appelées',
      visualizationType: 'lnsDatatable',
      state: {
        datasourceStates: {
          formBased: {
            layers: {
              [layerId]: {
                columns: {
                  url: {
                    label: 'URL',
                    dataType: 'string',
                    operationType: 'terms',
                    // `url.keyword` et non `url` : Logstash crée l'index avec le
                    // mapping dynamique, qui indexe les chaînes en `text` (non
                    // agrégeable) doublé d'un sous-champ `keyword`
                    sourceField: 'url.keyword',
                    isBucketed: true,
                    scale: 'ordinal',
                    params: {
                      size: 10,
                      orderBy: { type: 'column', columnId: 'metric' },
                      orderDirection: 'desc',
                      otherBucket: false,
                      missingBucket: false,
                      parentFormat: { id: 'terms' },
                    },
                  },
                  metric: {
                    label: 'Requêtes',
                    dataType: 'number',
                    operationType: 'count',
                    sourceField: '___records___',
                    isBucketed: false,
                    scale: 'ratio',
                    params: {},
                  },
                },
                columnOrder: ['url', 'metric'],
                incompleteColumns: {},
              },
            },
          },
        },
        visualization: {
          layerId,
          layerType: 'data',
          columns: [{ columnId: 'url' }, { columnId: 'metric' }],
        },
        filters: [],
        query: { query: 'level: "http"', language: 'kuery' },
      },
    },
    references: [
      { id: DATA_VIEW_ID, name: `indexpattern-datasource-layer-${layerId}`, type: 'index-pattern' },
    ],
  };
}

export function buildLogsObjects(): SavedObject[] {
  return [
    savedSearch('orion-logs-raw', 'Logs bruts du serveur', ''),
    savedSearch('orion-logs-errors', 'Logs bruts — erreurs (status ≥ 400)', ERROR_QUERY),
    errorCountPanel(),
    latencyPanel(),
    statusOverTimePanel(),
    topUrlsPanel(),
  ];
}

/**
 * Disposition : compteur d'erreurs et statuts dans le temps en haut, puis les
 * logs bruts, puis les seules erreurs.
 */
const LAYOUT = [
  { type: 'lens', id: 'orion-logs-error-count', grid: { w: 12, h: 10, x: 0, y: 0 } },
  { type: 'lens', id: 'orion-logs-latency', grid: { w: 12, h: 10, x: 12, y: 0 } },
  { type: 'lens', id: 'orion-logs-status-over-time', grid: { w: 24, h: 10, x: 24, y: 0 } },
  { type: 'lens', id: 'orion-logs-top-urls', grid: { w: 48, h: 12, x: 0, y: 10 } },
  { type: 'search', id: 'orion-logs-raw', grid: { w: 48, h: 14, x: 0, y: 22 } },
  { type: 'search', id: 'orion-logs-errors', grid: { w: 48, h: 14, x: 0, y: 36 } },
];

export function buildLogsDashboard(): SavedObject {
  const panelsJSON = LAYOUT.map((panel, index) => ({
    type: panel.type,
    gridData: { ...panel.grid, i: `panel-${index}` },
    panelIndex: `panel-${index}`,
    embeddableConfig: {},
    panelRefName: `panel_${index}`,
  }));

  return {
    id: 'orion-logs-dashboard',
    type: 'dashboard',
    attributes: {
      title: 'Logs applicatifs — Orion',
      description:
        'Logs HTTP structurés du serveur (cf. DOCUMENTATION.md § 6). Filtrer par « status >= 400 » dans la barre KQL pour ne voir que les erreurs.',
      panelsJSON: JSON.stringify(panelsJSON),
      optionsJSON: JSON.stringify({
        useMargins: true,
        syncColors: false,
        syncCursor: true,
        syncTooltips: false,
        hidePanelTitles: false,
      }),
      version: 1,
      timeRestore: true,
      // 7 derniers jours : les logs applicatifs sont produits en continu, à la
      // différence des runs de pipeline dont la période est figée
      timeFrom: 'now-7d',
      timeTo: 'now',
      kibanaSavedObjectMeta: {
        searchSourceJSON: JSON.stringify({ query: { query: '', language: 'kuery' }, filter: [] }),
      },
    },
    references: LAYOUT.map((panel, index) => ({ id: panel.id, name: `panel_${index}`, type: panel.type })),
  };
}
