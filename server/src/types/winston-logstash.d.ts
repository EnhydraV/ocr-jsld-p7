// Le paquet winston-logstash ne publie pas de types pour son point d'entrée
// winston 3.x (import profond) : déclaration locale du sous-ensemble utilisé.
declare module 'winston-logstash/lib/winston-logstash-latest' {
  import Transport from 'winston-transport';

  interface LogstashTransportOptions extends Transport.TransportStreamOptions {
    host?: string;
    port?: number;
    max_connect_retries?: number;
    timeout_connect_retries?: number;
  }

  class LogstashTransport extends Transport {
    constructor(options: LogstashTransportOptions);
    close(): void;
  }

  export = LogstashTransport;
}
