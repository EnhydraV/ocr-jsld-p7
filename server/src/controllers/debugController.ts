import { Request, Response } from 'express';

// Générateur de statuts HTTP arbitraires (façon httpbin /status/{code}) :
// produit du trafic varié pour alimenter la stack ELK — cf. §6.
export const debugController = {
  returnStatus(req: Request, res: Response): void {
    const code = Number(req.params.code);

    // 1xx exclus : une réponse finale informational fait patienter le client
    if (!Number.isInteger(code) || code < 200 || code > 599) {
      res.status(400).json({ error: 'Status code must be an integer between 200 and 599' });
      return;
    }

    // 204/304 : corps interdit par la spec HTTP
    if (code === 204 || code === 304) {
      res.status(code).end();
      return;
    }

    res.status(code).json({ status: code });
  },
};
