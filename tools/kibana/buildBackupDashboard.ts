/**
 * Objets sauvegardés du dashboard « Sauvegardes » (§ 7.3).
 *
 * Le service `backup` écrit ses événements avec le même logger que
 * l'application, donc dans l'index `orion-logs-*` : un échec de sauvegarde
 * devient visible là où l'on regarde déjà, au lieu de rester une ligne de
 * journal que personne ne lit.
 *
 * Événements émis : `backup_snapshot` (instantané pris), `backup_verified`
 * (restaurabilité confirmée), `backup_failed` (niveau error).
 */

const DATA_VIEW_ID = 'orion-logs';

interface SavedObject {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  references: { id: string; name: string; type: string }[];
}

const reference = (layerId: string) => ({
  id: DATA_VIEW_ID,
  name: `indexpattern-datasource-layer-${layerId}`,
  type: 'index-pattern',
});

const countColumn = (label: string): Record<string, unknown> => ({
  label,
  dataType: 'number',
  operationType: 'count',
  sourceField: '___records___',
  isBucketed: false,
  scale: 'ratio',
  params: {},
});

function metricPanel(id: string, title: string, query: string, column = countColumn(title)): SavedObject {
  const layerId = `layer-${id}`;
  return {
    id,
    type: 'lens',
    attributes: {
      title,
      visualizationType: 'lnsMetric',
      state: {
        datasourceStates: {
          formBased: {
            layers: { [layerId]: { columns: { metric: column }, columnOrder: ['metric'], incompleteColumns: {} } },
          },
        },
        visualization: { layerId, layerType: 'data', metricAccessor: 'metric' },
        filters: [],
        query: { query, language: 'kuery' },
      },
    },
    references: [reference(layerId)],
  };
}

/**
 * Sauvegardes dans le temps : c'est le panneau qui répond visuellement à la
 * question « et si ça échoue ? ». Une barre manquante est une sauvegarde
 * manquée - l'absence se voit, alors qu'elle n'émet aucun message.
 */
function timelinePanel(): SavedObject {
  const layerId = 'layer-backup-timeline';
  return {
    id: 'orion-backup-timeline',
    type: 'lens',
    attributes: {
      title: 'Sauvegardes dans le temps (un creux = une sauvegarde manquée)',
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
                    params: { interval: '1h', includeEmptyRows: true, dropPartials: false },
                  },
                  split: {
                    label: 'Événement',
                    dataType: 'string',
                    operationType: 'terms',
                    // `message.keyword` : Logstash indexe les chaînes en `text`,
                    // non agrégeable (« Fielddata is disabled on [message] »)
                    sourceField: 'message.keyword',
                    isBucketed: true,
                    scale: 'ordinal',
                    params: {
                      size: 5,
                      orderBy: { type: 'column', columnId: 'metric' },
                      orderDirection: 'desc',
                      otherBucket: false,
                      missingBucket: false,
                      parentFormat: { id: 'terms' },
                    },
                  },
                  metric: countColumn('Événements'),
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
        query: { query: 'component: "backup"', language: 'kuery' },
      },
    },
    references: [reference(layerId)],
  };
}

/** Journal des événements de sauvegarde, échecs compris. */
function eventsPanel(): SavedObject {
  return {
    id: 'orion-backup-events',
    type: 'search',
    attributes: {
      title: 'Journal des sauvegardes',
      description: '',
      columns: ['level', 'message', 'snapshot', 'sizeKb', 'kept', 'deleted', 'reason'],
      sort: [['@timestamp', 'desc']],
      hideChart: false,
      isTextBasedQuery: false,
      kibanaSavedObjectMeta: {
        searchSourceJSON: JSON.stringify({
          query: { query: 'component: "backup"', language: 'kuery' },
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

export function buildBackupObjects(): SavedObject[] {
  return [
    metricPanel('orion-backup-count', 'Sauvegardes réussies', 'message: "backup_snapshot"'),
    // Ce chiffre doit rester à zéro : c'est le seul indicateur à surveiller
    metricPanel('orion-backup-failures', 'ÉCHECS de sauvegarde', 'message: "backup_failed"'),
    metricPanel('orion-backup-verified', 'Contrôles de restaurabilité réussis', 'message: "backup_verified"'),
    metricPanel('orion-backup-size', 'Taille du dernier instantané (Ko)', 'message: "backup_snapshot"', {
      label: 'Taille (Ko)',
      dataType: 'number',
      operationType: 'last_value',
      sourceField: 'sizeKb',
      isBucketed: false,
      scale: 'ratio',
      params: { sortField: '@timestamp', showArrayValues: false },
    }),
    timelinePanel(),
    eventsPanel(),
  ];
}

const LAYOUT = [
  { type: 'lens', id: 'orion-backup-count', grid: { w: 12, h: 9, x: 0, y: 0 } },
  { type: 'lens', id: 'orion-backup-failures', grid: { w: 12, h: 9, x: 12, y: 0 } },
  { type: 'lens', id: 'orion-backup-verified', grid: { w: 12, h: 9, x: 24, y: 0 } },
  { type: 'lens', id: 'orion-backup-size', grid: { w: 12, h: 9, x: 36, y: 0 } },
  { type: 'lens', id: 'orion-backup-timeline', grid: { w: 48, h: 12, x: 0, y: 9 } },
  { type: 'search', id: 'orion-backup-events', grid: { w: 48, h: 14, x: 0, y: 21 } },
];

export function buildBackupDashboard(): SavedObject {
  const panelsJSON = LAYOUT.map((panel, index) => ({
    type: panel.type,
    gridData: { ...panel.grid, i: `panel-${index}` },
    panelIndex: `panel-${index}`,
    embeddableConfig: {},
    panelRefName: `panel_${index}`,
  }));

  return {
    id: 'orion-backup-dashboard',
    type: 'dashboard',
    attributes: {
      title: 'Sauvegardes — Orion',
      description:
        'Surveillance des sauvegardes de la base (cf. DOCUMENTATION.md § 7.3). Le compteur d\'échecs doit rester à zéro ; un creux dans la chronologie signale une sauvegarde manquée.',
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
      timeFrom: 'now-7d',
      timeTo: 'now',
      kibanaSavedObjectMeta: {
        searchSourceJSON: JSON.stringify({ query: { query: '', language: 'kuery' }, filter: [] }),
      },
    },
    references: LAYOUT.map((panel, index) => ({ id: panel.id, name: `panel_${index}`, type: panel.type })),
  };
}
