import { PrismaClient } from '@prisma/client';

// Instance unique partagée par tous les repositories (une seule connexion,
// et un point de mock unique pour les tests unitaires)
export const prisma = new PrismaClient();
