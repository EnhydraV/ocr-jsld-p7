import morgan from 'morgan';
import logger from '../lib/logger';

// Chaque requête devient un événement JSON structuré : Logstash l'indexe tel
// quel, Kibana peut agréger par status, URL ou temps de réponse sans parsing.
const jsonFormat: morgan.FormatFn = (tokens, req, res) =>
  JSON.stringify({
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status: Number(tokens.status(req, res)),
    responseTimeMs: Number(tokens['response-time'](req, res)),
    contentLength: Number(tokens.res(req, res, 'content-length') ?? 0),
  });

const httpLogger = morgan(jsonFormat, {
  // Le healthcheck Docker pingue toutes les 30 s : exclu pour ne pas noyer
  // la volumétrie réelle sous du bruit
  skip: (req) => req.url === '/api/health',
  stream: {
    write: (line: string) => {
      logger.http('http_request', JSON.parse(line));
    },
  },
});

export default httpLogger;
