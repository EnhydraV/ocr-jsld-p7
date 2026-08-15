/**
 * Chargement du `.env` local de `tools/`, s'il existe. Évite de réexporter
 * GITHUB_TOKEN à chaque terminal — pénible sous Windows, où la syntaxe
 * `VAR=$(...)` d'une seule ligne n'existe pas.
 *
 * Import à EFFET DE BORD, à placer en PREMIER dans les scripts d'entrée : les
 * modules importés ensuite peuvent lire process.env dès leur évaluation
 * (kibana/client.ts, par exemple, fige KIBANA_URL au chargement).
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('.env', import.meta.url));

// `process.loadEnvFile` (builtin Node >= 20.12, aucune dépendance) NE SURCHARGE
// PAS une variable déjà définie : le shell et la CI gardent la priorité sur le
// fichier. Il lève si le fichier est absent, d'où le test préalable.
if (existsSync(envFile)) process.loadEnvFile(envFile);
