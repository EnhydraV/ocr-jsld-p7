/**
 * Objets sauvegardés du dashboard « Vulnérabilités » (§ 8).
 *
 * Source : l'index `orion-vulnerabilities`, projection des alertes Dependabot
 * (`npm run deps:index`). Un document par alerte, mis à jour à chaque
 * réindexation — les états (open → fixed/dismissed) évoluent sans dupliquer.
 *
 * Le dashboard complète l'onglet Security de GitHub, il ne le remplace pas :
 * GitHub alerte, ici on MESURE (encours par sévérité, délai de remédiation
 * § 5.3, historique d'apparition).
 */

const DATA_VIEW_ID = 'orion-vulnerabilities';

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

/** Apparition des alertes dans le temps, empilées par sévérité. */
function timelinePanel(): SavedObject {
  const layerId = 'layer-vulns-timeline';
  return {
    id: 'orion-vulns-timeline',
    type: 'lens',
    attributes: {
      title: 'Alertes créées dans le temps, par sévérité',
      visualizationType: 'lnsXY',
      state: {
        datasourceStates: {
          formBased: {
            layers: {
              [layerId]: {
                columns: {
                  bucket: {
                    label: 'Date',
                    dataType: 'date',
                    operationType: 'date_histogram',
                    sourceField: '@timestamp',
                    isBucketed: true,
                    scale: 'interval',
                    params: { interval: '1d', includeEmptyRows: true, dropPartials: false },
                  },
                  split: {
                    label: 'Sévérité',
                    dataType: 'string',
                    operationType: 'terms',
                    sourceField: 'severity',
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
                  metric: countColumn('Alertes'),
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
    references: [reference(layerId)],
  };
}

/** Registre des alertes : le détail derrière les compteurs. */
function alertsPanel(): SavedObject {
  return {
    id: 'orion-vulns-registry',
    type: 'search',
    attributes: {
      title: 'Registre des alertes Dependabot',
      description: '',
      columns: ['package', 'severity', 'state', 'scope', 'manifest', 'ghsa_id', 'dismissed_reason', 'summary'],
      sort: [['@timestamp', 'desc']],
      hideChart: false,
      isTextBasedQuery: false,
      kibanaSavedObjectMeta: {
        searchSourceJSON: JSON.stringify({
          query: { query: '', language: 'kuery' },
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

export function buildVulnObjects(): SavedObject[] {
  return [
    // Le seul chiffre à surveiller : tout le reste est du contexte
    metricPanel('orion-vulns-open', 'Alertes OUVERTES (objectif : 0)', 'state: "open"'),
    metricPanel(
      'orion-vulns-open-severe',
      'Ouvertes critiques ou hautes',
      'state: "open" and severity: ("critical" or "high")'
    ),
    // Le KPI du § 5.3 : combien de temps une vulnérabilité corrigée est restée
    // ouverte. Vide tant qu'aucune alerte n'a de fixed_at — c'est normal.
    metricPanel('orion-vulns-remediation', 'Délai médian de remédiation (jours)', 'state: "fixed"', {
      label: 'Délai (jours)',
      dataType: 'number',
      operationType: 'median',
      sourceField: 'remediation_days',
      isBucketed: false,
      scale: 'ratio',
      // Sans format explicite, Kibana affiche trois décimales : « 0.466 jour »
      // se lit mal pour un délai de remédiation.
      params: { format: { id: 'number', params: { decimals: 2 } } },
    }),
    // Classées par GitHub sans intervention (dev-only) : du contexte, pas du travail
    metricPanel('orion-vulns-dismissed', 'Classées sans correctif', 'state: ("dismissed" or "auto_dismissed")'),
    timelinePanel(),
    alertsPanel(),
  ];
}

const LAYOUT = [
  { type: 'lens', id: 'orion-vulns-open', grid: { w: 12, h: 9, x: 0, y: 0 } },
  { type: 'lens', id: 'orion-vulns-open-severe', grid: { w: 12, h: 9, x: 12, y: 0 } },
  { type: 'lens', id: 'orion-vulns-remediation', grid: { w: 12, h: 9, x: 24, y: 0 } },
  { type: 'lens', id: 'orion-vulns-dismissed', grid: { w: 12, h: 9, x: 36, y: 0 } },
  { type: 'lens', id: 'orion-vulns-timeline', grid: { w: 48, h: 12, x: 0, y: 9 } },
  { type: 'search', id: 'orion-vulns-registry', grid: { w: 48, h: 14, x: 0, y: 21 } },
];

export function buildVulnDashboard(): SavedObject {
  const panelsJSON = LAYOUT.map((panel, index) => ({
    type: panel.type,
    gridData: { ...panel.grid, i: `panel-${index}` },
    panelIndex: `panel-${index}`,
    embeddableConfig: {},
    panelRefName: `panel_${index}`,
  }));

  return {
    id: 'orion-vulns-dashboard',
    type: 'dashboard',
    attributes: {
      title: 'Vulnérabilités — Orion',
      description:
        "Alertes Dependabot projetées par « npm run deps:index » (cf. DOCUMENTATION.md § 8). Le compteur d'alertes ouvertes doit rester à zéro ; le délai médian de remédiation est le KPI du § 5.3.",
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
      // Les alertes sont rares : une fenêtre courte donnerait un dashboard
      // faussement vide alors que des alertes restent ouvertes
      timeFrom: 'now-90d',
      timeTo: 'now',
      kibanaSavedObjectMeta: {
        searchSourceJSON: JSON.stringify({ query: { query: '', language: 'kuery' }, filter: [] }),
      },
    },
    references: LAYOUT.map((panel, index) => ({ id: panel.id, name: `panel_${index}`, type: panel.type })),
  };
}
