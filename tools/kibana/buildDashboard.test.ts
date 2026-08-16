import { describe, it, expect } from 'vitest';
import { buildDashboard, buildPanels } from './buildDashboard.js';

// Garde-fous structurels : les erreurs de forme d'un objet sauvegardé ne se
// voient qu'à l'import ou au rendu dans Kibana (panneau vide, références
// manquantes). Ces tests attrapent les fautes évidentes sans instance Kibana.
describe('buildPanels', () => {
  const panels = buildPanels();

  it('produces the eight panels of the dashboard', () => {
    expect(panels).toHaveLength(8);
  });

  // Le CFR est la moyenne d'un champ 0/1 : filtrer sur `conclusion` le figerait
  // à 100 %, puisque le dénominateur ne contiendrait plus que des échecs.
  it('averages the failure flag over every push, not only the failed ones', () => {
    const panel = panels.find((candidate) => candidate.id === 'orion-pipeline-cfr');
    const state = panel?.attributes.state as {
      query: { query: string };
      datasourceStates: { formBased: { layers: Record<string, { columns: { metric: Record<string, unknown> } }> } };
    };
    const [layer] = Object.values(state.datasourceStates.formBased.layers);

    expect(state.query.query).toBe('doc_type: "run" and event: "push"');
    expect(state.query.query).not.toContain('conclusion');
    expect(layer.columns.metric).toMatchObject({ operationType: 'average', sourceField: 'is_failure' });
  });

  it('gives every panel a unique id', () => {
    const ids = panels.map((panel) => panel.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points every layer at the pipeline data view', () => {
    for (const panel of panels) {
      expect(panel.references).toHaveLength(1);
      expect(panel.references[0]).toMatchObject({ type: 'index-pattern', id: 'orion-pipeline-metrics' });
    }
  });

  it('names the reference after the layer it belongs to', () => {
    for (const panel of panels) {
      const state = panel.attributes.state as { datasourceStates: { formBased: { layers: Record<string, unknown> } } };
      const [layerId] = Object.keys(state.datasourceStates.formBased.layers);

      expect(panel.references[0].name).toBe(`indexpattern-datasource-layer-${layerId}`);
    }
  });

  // Les champs duration_s et conclusion existent sur plusieurs doc_type : sans
  // filtre, un panneau mélangerait runs et jobs et afficherait un chiffre faux.
  it('filters every panel on a doc_type', () => {
    for (const panel of panels) {
      const state = panel.attributes.state as { query: { query: string } };

      expect(state.query.query).toContain('doc_type');
    }
  });

  // L'infobulle est la seule explication disponible pour qui lit le dashboard
  // sans la documentation à côté : une tuile muette se lit de travers.
  it('documents every panel with a contextual description', () => {
    for (const panel of panels) {
      expect(typeof panel.attributes.description).toBe('string');
      expect((panel.attributes.description as string).length).toBeGreaterThan(40);
    }
  });

  it('never carries kibanaSavedObjectMeta, rejected by the strict lens mapping', () => {
    for (const panel of panels) {
      expect(panel.attributes).not.toHaveProperty('kibanaSavedObjectMeta');
    }
  });
});

describe('buildDashboard', () => {
  const panels = buildPanels();
  const dashboard = buildDashboard(panels);

  it('references every panel', () => {
    expect(dashboard.references).toHaveLength(panels.length);
    expect(dashboard.references.map((reference) => reference.id)).toEqual(panels.map((panel) => panel.id));
  });

  it('matches each panel reference name with its panelsJSON entry', () => {
    const layout = JSON.parse(dashboard.attributes.panelsJSON as string) as { panelRefName: string }[];

    expect(layout.map((panel) => panel.panelRefName)).toEqual(
      dashboard.references.map((reference) => reference.name)
    );
  });

  // Sans plage figée, le dashboard s'ouvre sur « les 15 dernières minutes » et
  // paraît vide, les runs analysés étant plus anciens.
  it('restores a time range wide enough to show the data', () => {
    expect(dashboard.attributes.timeRestore).toBe(true);
    expect(Date.parse(dashboard.attributes.timeFrom as string)).toBeLessThan(Date.parse('2026-07-23T00:00:00Z'));
  });

  it('gives every panel a slot on the grid', () => {
    const layout = JSON.parse(dashboard.attributes.panelsJSON as string) as { gridData: unknown }[];

    expect(layout).toHaveLength(panels.length);
    for (const { gridData } of layout) expect(gridData).toBeDefined();
  });

  // Un chevauchement ne casse rien à l'import : Kibana réempile les panneaux en
  // silence, et la disposition versionnée cesse d'être celle qui s'affiche.
  it('lays panels out without overflowing or overlapping', () => {
    const layout = JSON.parse(dashboard.attributes.panelsJSON as string) as {
      gridData: { x: number; w: number; y: number; h: number };
    }[];

    for (const { gridData } of layout) {
      expect(gridData.x + gridData.w).toBeLessThanOrEqual(48);
    }

    const boxes = layout.map((panel) => panel.gridData);
    for (const [index, box] of boxes.entries()) {
      for (const other of boxes.slice(index + 1)) {
        const overlaps =
          box.x < other.x + other.w &&
          other.x < box.x + box.w &&
          box.y < other.y + other.h &&
          other.y < box.y + box.h;

        expect(overlaps).toBe(false);
      }
    }
  });
});
