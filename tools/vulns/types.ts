/** Sous-ensemble utile d'une alerte Dependabot (API REST GitHub). */
export interface DependabotAlert {
  number: number;
  state: 'open' | 'fixed' | 'dismissed' | 'auto_dismissed';
  dependency: {
    package: { ecosystem: string; name: string };
    manifest_path: string;
    /** `development` ou `runtime` : la distinction qui pèse dans la priorisation. */
    scope: string | null;
  };
  security_advisory: {
    ghsa_id: string;
    cve_id: string | null;
    summary: string;
    severity: string;
    cvss: { score: number | null };
  };
  created_at: string;
  updated_at: string;
  fixed_at: string | null;
  dismissed_at: string | null;
  dismissed_reason: string | null;
  auto_dismissed_at: string | null;
}
