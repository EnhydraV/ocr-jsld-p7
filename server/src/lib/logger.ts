import winston from 'winston';
import LogstashTransport from 'winston-logstash/lib/winston-logstash-latest';

export interface LoggerEnv {
  LOG_LEVEL?: string;
  LOGSTASH_HOST?: string;
  LOGSTASH_PORT?: string;
  NODE_ENV?: string;
}

// Sortie systématique en JSON sur stdout (docker logs reste exploitable) ;
// l'envoi vers Logstash ne s'active que si LOGSTASH_HOST est défini, la stack
// ELK (elk/docker-compose.yml) étant optionnelle et hors CI/CD.
export function createLogger(env: LoggerEnv): winston.Logger {
  const transports: winston.transport[] = [new winston.transports.Console()];

  if (env.LOGSTASH_HOST) {
    const logstash = new LogstashTransport({
      host: env.LOGSTASH_HOST,
      port: Number(env.LOGSTASH_PORT ?? 5000),
    });
    // Retries de connexion épuisés : le transport se coupe tout seul (silent) ;
    // on trace l'incident au lieu de laisser l'erreur faire tomber l'API
    logstash.on('error', (err: Error) => {
      console.error(`Logstash transport disabled: ${err.message}`);
    });
    transports.push(logstash);
  }

  return winston.createLogger({
    // « http » inclut les niveaux error/warn/info : les requêtes sont loguées par défaut
    level: env.LOG_LEVEL ?? 'http',
    silent: env.NODE_ENV === 'test',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    defaultMeta: { service: 'orion-server' },
    transports,
  });
}

const logger = createLogger(process.env);

export default logger;
