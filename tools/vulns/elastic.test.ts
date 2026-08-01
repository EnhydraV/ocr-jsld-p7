import { describe, it, expect } from 'vitest';
import { buildAlertDocuments } from './elastic.js';
import type { DependabotAlert } from './types.js';

const baseAlert = (overrides: Partial<DependabotAlert> = {}): DependabotAlert => ({
  number: 7,
  state: 'open',
  dependency: {
    package: { ecosystem: 'npm', name: 'tar' },
    manifest_path: 'package-lock.json',
    scope: 'development',
  },
  security_advisory: {
    ghsa_id: 'GHSA-xxxx-yyyy-zzzz',
    cve_id: 'CVE-2026-0001',
    summary: 'Arbitrary file overwrite',
    severity: 'medium',
    cvss: { score: 6.5 },
  },
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-08-01T10:00:00Z',
  fixed_at: null,
  dismissed_at: null,
  dismissed_reason: null,
  auto_dismissed_at: null,
  ...overrides,
});

describe('buildAlertDocuments', () => {
  it('keys each document by alert number, so reindexing updates instead of duplicating', () => {
    const [document] = buildAlertDocuments([baseAlert()]);

    expect(document.id).toBe('alert-7');
    expect(document.body).toMatchObject({
      '@timestamp': '2026-08-01T10:00:00Z',
      state: 'open',
      severity: 'medium',
      package: 'tar',
      ecosystem: 'npm',
      manifest: 'package-lock.json',
      scope: 'development',
      ghsa_id: 'GHSA-xxxx-yyyy-zzzz',
      cve_id: 'CVE-2026-0001',
      cvss_score: 6.5,
    });
  });

  // Le KPI du § 5.3 : uniquement pour les alertes réellement corrigées — un
  // classement sans correctif n'est pas une remédiation.
  it('computes remediation days only for fixed alerts', () => {
    const open = buildAlertDocuments([baseAlert()])[0];
    const fixed = buildAlertDocuments([
      baseAlert({ state: 'fixed', fixed_at: '2026-08-04T22:00:00Z' }),
    ])[0];
    const dismissed = buildAlertDocuments([
      baseAlert({ state: 'dismissed', dismissed_at: '2026-08-04T22:00:00Z', dismissed_reason: 'tolerable_risk' }),
    ])[0];

    expect(open.body.remediation_days).toBeNull();
    expect(fixed.body.remediation_days).toBeCloseTo(3.5);
    expect(dismissed.body.remediation_days).toBeNull();
  });

  // GitHub range la date d'un auto-classement dans un champ distinct : le
  // dashboard, lui, n'a qu'une notion de « classée le ».
  it('falls back to auto_dismissed_at when GitHub auto-dismissed the alert', () => {
    const [document] = buildAlertDocuments([
      baseAlert({ state: 'auto_dismissed', auto_dismissed_at: '2026-08-01T11:24:25Z' }),
    ]);

    expect(document.body.state).toBe('auto_dismissed');
    expect(document.body.dismissed_at).toBe('2026-08-01T11:24:25Z');
  });

  it('tolerates advisories without CVE or CVSS score', () => {
    const [document] = buildAlertDocuments([
      baseAlert({
        security_advisory: {
          ghsa_id: 'GHSA-aaaa-bbbb-cccc',
          cve_id: null,
          summary: 'No CVE yet',
          severity: 'low',
          cvss: { score: null },
        },
      }),
    ]);

    expect(document.body.cve_id).toBeNull();
    expect(document.body.cvss_score).toBeNull();
  });
});
