import { describe, it, expect } from 'vitest';
import { buildBackupDashboard, buildBackupObjects } from './buildBackupDashboard.js';

describe('buildBackupObjects', () => {
  const objects = buildBackupObjects();

  it('provides five aggregated panels and one event log', () => {
    expect(objects.filter((object) => object.type === 'lens')).toHaveLength(5);
    expect(objects.filter((object) => object.type === 'search')).toHaveLength(1);
  });

  it('reads the application logs data view, where the scheduler writes', () => {
    for (const object of objects) {
      expect(object.references[0]).toMatchObject({ type: 'index-pattern', id: 'orion-logs' });
    }
  });

  // Le compteur d'échecs est la raison d'être du dashboard : sans lui, un échec
  // de sauvegarde resterait une ligne de journal que personne ne lit.
  it('counts failures as a panel of its own', () => {
    const failures = objects.find((object) => object.id === 'orion-backup-failures');
    const state = failures?.attributes.state as { query: { query: string } };

    expect(state.query.query).toContain('backup_failed');
  });

  it('scopes every panel to the backup component or its events', () => {
    for (const object of objects.filter((entry) => entry.type === 'lens')) {
      const state = object.attributes.state as { query: { query: string } };

      expect(state.query.query).toMatch(/component: "backup"|backup_/);
    }
  });

  // Logstash indexe les chaînes en `text`, non agrégeable : agréger sur
  // `message` échoue avec « Fielddata is disabled on [message] ».
  it('aggregates event names on the keyword subfield', () => {
    const timeline = objects.find((object) => object.id === 'orion-backup-timeline');
    const state = timeline?.attributes.state as {
      datasourceStates: { formBased: { layers: Record<string, { columns: Record<string, { sourceField?: string }> }> } };
    };
    const [layer] = Object.values(state.datasourceStates.formBased.layers);

    expect(layer.columns.split?.sourceField).toBe('message.keyword');
  });

  it('shows the failure reason among the log columns', () => {
    const journal = objects.find((object) => object.type === 'search');

    expect(journal?.attributes.columns).toContain('reason');
  });
});

describe('buildBackupDashboard', () => {
  const dashboard = buildBackupDashboard();

  it('references its six panels in layout order', () => {
    const layout = JSON.parse(dashboard.attributes.panelsJSON as string) as { panelRefName: string; type: string }[];

    expect(layout).toHaveLength(6);
    expect(layout.map((panel) => panel.panelRefName)).toEqual(dashboard.references.map((reference) => reference.name));
    expect(layout.map((panel) => panel.type)).toEqual(dashboard.references.map((reference) => reference.type));
  });

  it('opens on a relative window, backups being continuous', () => {
    expect(dashboard.attributes.timeFrom).toBe('now-7d');
  });
});
