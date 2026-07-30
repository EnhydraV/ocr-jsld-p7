import { describe, it, expect } from 'vitest';
import { buildLogsDashboard, buildLogsObjects, ERROR_QUERY } from './buildLogsDashboard.js';

describe('buildLogsObjects', () => {
  const objects = buildLogsObjects();

  it('provides two raw log views and four aggregated panels', () => {
    expect(objects.filter((object) => object.type === 'search')).toHaveLength(2);
    expect(objects.filter((object) => object.type === 'lens')).toHaveLength(4);
  });

  it('points every object at the application logs data view', () => {
    for (const object of objects) {
      expect(object.references).toHaveLength(1);
      expect(object.references[0]).toMatchObject({ type: 'index-pattern', id: 'orion-logs' });
    }
  });

  // Une recherche sauvegardée référence sa data view par ce nom précis, attendu
  // dans le searchSourceJSON : s'en écarter casse l'objet à l'import.
  it('names the saved search reference after its searchSource', () => {
    for (const search of objects.filter((object) => object.type === 'search')) {
      expect(search.references[0].name).toBe('kibanaSavedObjectMeta.searchSourceJSON.index');

      const meta = search.attributes.kibanaSavedObjectMeta as { searchSourceJSON: string };
      expect(JSON.parse(meta.searchSourceJSON).indexRefName).toBe(search.references[0].name);
    }
  });

  it('restricts one of the two views to error responses', () => {
    const queries = objects
      .filter((object) => object.type === 'search')
      .map((search) => JSON.parse((search.attributes.kibanaSavedObjectMeta as { searchSourceJSON: string }).searchSourceJSON).query.query);

    expect(queries).toContain('');
    expect(queries).toContain(ERROR_QUERY);
  });

  // Sans le champ message, les événements non HTTP (démarrage, erreur Prisma)
  // apparaissent comme des lignes vides.
  it('shows the message column so non-HTTP events stay readable', () => {
    for (const search of objects.filter((object) => object.type === 'search')) {
      expect(search.attributes.columns).toContain('message');
    }
  });

  // Logstash indexe les chaînes en `text` (non agrégeable) + sous-champ keyword :
  // agréger sur `url` échoue, il faut `url.keyword`.
  it('aggregates urls on the keyword subfield', () => {
    const topUrls = objects.find((object) => object.id === 'orion-logs-top-urls');
    const state = topUrls?.attributes.state as {
      datasourceStates: { formBased: { layers: Record<string, { columns: Record<string, { sourceField?: string }> }> } };
    };
    const [layer] = Object.values(state.datasourceStates.formBased.layers);

    expect(layer.columns.url?.sourceField).toBe('url.keyword');
  });
});

describe('buildLogsDashboard', () => {
  const dashboard = buildLogsDashboard();

  it('references the six panels in layout order', () => {
    const layout = JSON.parse(dashboard.attributes.panelsJSON as string) as { panelRefName: string; type: string }[];

    expect(layout).toHaveLength(6);
    expect(layout.map((panel) => panel.panelRefName)).toEqual(dashboard.references.map((reference) => reference.name));
    expect(layout.map((panel) => panel.type)).toEqual(dashboard.references.map((reference) => reference.type));
  });

  // Les logs arrivent en continu, contrairement aux runs de pipeline : une
  // fenêtre relative reste pertinente dans le temps.
  it('opens on a relative time window', () => {
    expect(dashboard.attributes.timeRestore).toBe(true);
    expect(dashboard.attributes.timeFrom).toBe('now-7d');
  });
});
