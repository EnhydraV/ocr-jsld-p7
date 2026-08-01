import { describe, it, expect } from 'vitest';
import { buildVulnDashboard, buildVulnObjects } from './buildVulnDashboard.js';

describe('buildVulnObjects', () => {
  const objects = buildVulnObjects();

  it('provides five aggregated panels and one alert registry', () => {
    expect(objects.filter((object) => object.type === 'lens')).toHaveLength(5);
    expect(objects.filter((object) => object.type === 'search')).toHaveLength(1);
  });

  it('has unique ids', () => {
    const ids = objects.map((object) => object.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reads the vulnerabilities data view everywhere', () => {
    for (const object of objects) {
      expect(object.references[0]).toMatchObject({ type: 'index-pattern', id: 'orion-vulnerabilities' });
    }
  });

  // La raison d'être du dashboard : l'encours d'alertes ouvertes, à zéro.
  it('counts open alerts as a panel of its own', () => {
    const open = objects.find((object) => object.id === 'orion-vulns-open');
    const state = open?.attributes.state as { query: { query: string } };

    expect(state.query.query).toContain('state: "open"');
  });

  // Le KPI du § 5.3 : médiane du délai de remédiation, sur les alertes
  // corrigées uniquement.
  it('measures the median remediation delay on fixed alerts only', () => {
    const remediation = objects.find((object) => object.id === 'orion-vulns-remediation');
    const state = remediation?.attributes.state as {
      query: { query: string };
      datasourceStates: { formBased: { layers: Record<string, { columns: { metric: Record<string, unknown> } }> } };
    };

    expect(state.query.query).toBe('state: "fixed"');
    const layers = Object.values(state.datasourceStates.formBased.layers);
    expect(layers[0].columns.metric).toMatchObject({ operationType: 'median', sourceField: 'remediation_days' });
  });

  it('splits the timeline by severity', () => {
    const timeline = objects.find((object) => object.id === 'orion-vulns-timeline');
    const state = timeline?.attributes.state as {
      datasourceStates: { formBased: { layers: Record<string, { columns: { split: { sourceField: string } } }> } };
    };

    expect(Object.values(state.datasourceStates.formBased.layers)[0].columns.split.sourceField).toBe('severity');
  });

  // Piège d'API vu sur les dashboards précédents : une recherche sauvegardée
  // référence sa data view sous ce nom EXACT, repris dans indexRefName.
  it('wires the registry search source to its data view by the exact reference name', () => {
    const registry = objects.find((object) => object.type === 'search');
    const meta = registry?.attributes.kibanaSavedObjectMeta as { searchSourceJSON: string };
    const source = JSON.parse(meta.searchSourceJSON) as { indexRefName: string };

    expect(source.indexRefName).toBe('kibanaSavedObjectMeta.searchSourceJSON.index');
    expect(registry?.references[0].name).toBe('kibanaSavedObjectMeta.searchSourceJSON.index');
  });

  // Piège d'API : le type `lens` refuse `kibanaSavedObjectMeta` (mapping strict).
  it('never sets kibanaSavedObjectMeta on lens panels', () => {
    for (const object of objects.filter((entry) => entry.type === 'lens')) {
      expect(object.attributes.kibanaSavedObjectMeta).toBeUndefined();
    }
  });

  it('shows the dismissal columns in the registry', () => {
    const registry = objects.find((object) => object.type === 'search');
    expect(registry?.attributes.columns).toContain('state');
    expect(registry?.attributes.columns).toContain('dismissed_reason');
  });
});

describe('buildVulnDashboard', () => {
  const dashboard = buildVulnDashboard();
  const objects = buildVulnObjects();

  it('references every panel it lays out, and only those', () => {
    const panels = JSON.parse(dashboard.attributes.panelsJSON as string) as { panelRefName: string }[];
    const referenceNames = dashboard.references.map((entry) => entry.name);

    expect(panels.map((panel) => panel.panelRefName)).toEqual(referenceNames.map((name) => name.replace('panel_', 'panel_')));
    expect(dashboard.references).toHaveLength(panels.length);
    for (const entry of dashboard.references) {
      expect(objects.some((object) => object.id === entry.id && object.type === entry.type)).toBe(true);
    }
  });

  it('fills the 48-column grid without overflow', () => {
    const panels = JSON.parse(dashboard.attributes.panelsJSON as string) as {
      gridData: { x: number; w: number };
    }[];
    for (const panel of panels) {
      expect(panel.gridData.x + panel.gridData.w).toBeLessThanOrEqual(48);
    }
  });

  // Les alertes sont rares : une fenêtre courte donnerait un dashboard
  // faussement vide alors que des alertes restent ouvertes.
  it('restores a wide time range', () => {
    expect(dashboard.attributes.timeRestore).toBe(true);
    expect(dashboard.attributes.timeFrom).toBe('now-90d');
  });
});
