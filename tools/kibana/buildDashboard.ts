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

/**
 * Réglages communs à tous les panneaux :
 * - `query` : filtre KQL appliqué au panneau entier (les champs sont partagés
 *   entre doc_type, sans filtre un panneau mélangerait runs et jobs) ;
 * - `description` : aide contextuelle. Kibana l'affiche en infobulle derrière
 *   l'icône d'information de l'en-tête du panneau — c'est le champ « Description »
 *   du formulaire d'enregistrement de Lens. Sans elle, un lecteur qui n'a pas la
 *   documentation sous les yeux doit deviner ce que mesure la tuile, et surtout
 *   sur quel périmètre.
 */
interface PanelOptions {
  query: string;
  description: string;
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
  options: PanelOptions
): SavedObject {
  const layerId = `layer-${id}`;
  return {
    id,
    type: 'lens',
    attributes: {
      title,
      description: options.description,
      visualizationType: 'lnsMetric',
      state: {
        datasourceStates: {
          formBased: { layers: { [layerId]: { columns: { metric: column }, columnOrder: ['metric'], incompleteColumns: {} } } },
        },
        visualization: { layerId, layerType: 'data', metricAccessor: 'metric' },
        filters: [],
        query: { query: options.query, language: 'kuery' },
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
  options: PanelOptions,
  horizontal = false
): SavedObject {
  const layerId = `layer-${id}`;
  return {
    id,
    type: 'lens',
    attributes: {
      title,
      description: options.description,
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
        query: { query: options.query, language: 'kuery' },
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
  options: PanelOptions
): SavedObject {
  const layerId = `layer-${id}`;
  return {
    id,
    type: 'lens',
    attributes: {
      title,
      description: options.description,
      visualizationType: 'lnsDatatable',
      state: {
        datasourceStates: {
          formBased: { layers: { [layerId]: { columns, columnOrder: order, incompleteColumns: {} } } },
        },
        visualization: { layerId, layerType: 'data', columns: order.map((columnId) => ({ columnId })) },
        filters: [],
        query: { query: options.query, language: 'kuery' },
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

/** Les 8 panneaux, dans l'ordre de lecture du dashboard. */
export function buildPanels(): SavedObject[] {
  return [
    metricPanel(
      'orion-pipeline-publications',
      'Publications (livraisons)',
      metricColumn('count', 'Publications', '___records___'),
      {
        query: 'doc_type: "run" and is_publication: true',
        description:
          "Deployment frequency (DORA). Une publication = un job « Publication GHCR » réussi. L'image est alors PRÊTE à être déployée, pas déployée : le projet n'a pas d'environnement de production. Cf. DOCUMENTATION.md § 6.1.",
      }
    ),
    metricPanel(
      'orion-pipeline-leadtime',
      'Lead time médian (min)',
      metricColumn('median', 'Lead time médian (min)', 'lead_time_min', { id: 'number', params: { decimals: 1 } }),
      {
        query: 'doc_type: "run" and is_publication: true',
        description:
          "Lead time for changes (DORA) : minutes entre le commit et la fin de la publication de l'image. Médiane et non moyenne — un seul run anormalement long fausserait la moyenne sur un échantillon de cette taille.",
      }
    ),
    metricPanel(
      'orion-pipeline-mttr',
      'MTTR médian (h)',
      metricColumn('median', 'MTTR médian (h)', 'recovery_hours', { id: 'number', params: { decimals: 1 } }),
      {
        query: 'doc_type: "episode"',
        description:
          "Time to restore service (DORA), mesuré sur le PIPELINE faute de production à rétablir : durée d'un épisode rouge → vert. Les runs rouges consécutifs comptent pour un seul épisode, sinon une même panne serait comptée plusieurs fois.",
      }
    ),
    // 4e métrique DORA, longtemps absente du dashboard alors qu'elle figurait
    // dans le rapport texte. La moyenne d'un champ 0/1 est le taux lui-même :
    // dénominateur = tous les pushes, numérateur = ceux en échec, soit
    // exactement `changeFailureRatePipeline` (dora/metrics.ts).
    metricPanel(
      'orion-pipeline-cfr',
      'Change failure rate (pipeline)',
      metricColumn('average', 'Change failure rate', 'is_failure', { id: 'percent', params: { decimals: 1 } }),
      {
        query: 'doc_type: "run" and event: "push"',
        description:
          "Change failure rate (DORA) au périmètre PIPELINE : part des pushes sur main dont le run échoue (moyenne d'un indicateur 0/1). Le CFR au périmètre déploiement est non mesurable sans production. Réserve : un aléa d'infrastructure GitHub compte ici comme un échec et surestime donc la valeur.",
      }
    ),
    metricPanel(
      'orion-pipeline-success-rate',
      'Runs verts',
      metricColumn('count', 'Runs verts', '___records___'),
      {
        query: 'doc_type: "run" and conclusion: "success"',
        description:
          "Nombre de runs terminés en succès, TOUS déclencheurs confondus (push, nightly planifié, PR). À ne pas rapprocher directement du taux d'échec ci-contre, qui ne porte lui que sur les pushes.",
      }
    ),
    barPanel(
      'orion-pipeline-duration',
      'Durée des pipelines verts (s)',
      metricColumn('median', 'Durée médiane (s)', 'duration_s', { id: 'number', params: { decimals: 0 } }),
      dateHistogram('Jour'),
      {
        query: 'doc_type: "run" and event: "push" and conclusion: "success"',
        description:
          "Durée médiane par jour des runs de push réussis. Les runs en échec sont exclus volontairement : ils s'arrêtent au premier job rouge et raccourciraient artificiellement la courbe.",
      }
    ),
    barPanel(
      'orion-pipeline-jobs',
      'Durée médiane par job (s)',
      metricColumn('median', 'Durée médiane (s)', 'duration_s', { id: 'number', params: { decimals: 0 } }),
      termsColumn('job_name', 'Job'),
      {
        query: 'doc_type: "job" and conclusion: "success"',
        description:
          "Durée médiane de chaque job réussi : sert à identifier le maillon lent du pipeline. Jobs en échec exclus, pour la même raison que le graphique voisin.",
      },
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
      {
        query: 'doc_type: "run" and conclusion: "failure"',
        description:
          "Un run rouge par ligne. « 1er signal d'échec » = délai entre le début du run et la fin du premier job en échec, c'est-à-dire le temps réel avant retour à l'auteur du commit.",
      }
    ),
  ];
}

/**
 * Disposition : 5 tuiles sur la 1re ligne, puis les graphiques, puis la table.
 * Les quatre premières sont les quatre métriques DORA dans leur ordre canonique
 * (fréquence, lead time, MTTR, taux d'échec) ; la grille Kibana faisant 48
 * colonnes, 10+10+10+9+9 la remplit exactement.
 */
const GRID = [
  { w: 10, h: 8, x: 0, y: 0 },
  { w: 10, h: 8, x: 10, y: 0 },
  { w: 10, h: 8, x: 20, y: 0 },
  { w: 9, h: 8, x: 30, y: 0 },
  { w: 9, h: 8, x: 39, y: 0 },
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
