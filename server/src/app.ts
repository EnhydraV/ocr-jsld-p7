import express, { Application, Request, Response } from 'express';
import dotenv from 'dotenv';
import organizationRoutes from './routes/organizationRoutes';
import contactRoutes from './routes/contactRoutes';

dotenv.config();

// L'app est construite ici sans être démarrée : les tests d'intégration
// (Supertest) l'importent directement, index.ts se charge du listen().
const app: Application = express();
app.disable('x-powered-by');

// Pas de middleware CORS : le front passe par le reverse proxy nginx (prod)
// ou le proxy Vite (dev), donc même origine — aucune requête cross-origin
// n'est légitime. Sans en-têtes CORS, le navigateur les bloque toutes.

// Middleware
app.use(express.json());

// Routes
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'OK', message: 'Orion CRM API is running' });
});

app.use('/api/organizations', organizationRoutes);
app.use('/api/contacts', contactRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
