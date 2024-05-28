import { createLogger, Logger } from '@restorecommerce/logger';
import { Provider } from 'nconf';
import { createServiceConfig } from '@restorecommerce/service-config';
import ldap from 'ldapjs';
import { wrapLogger } from './logger.js';
import { mountPaths } from './ldap.js';
import { createClient, createChannel } from '@restorecommerce/grpc-client';
import {
  UserServiceClient,
  UserServiceDefinition
} from '@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/user.js';

export class Worker {

  public readonly cfg: Provider;
  public readonly logger: Logger;

  public server: ldap.Server;
  public ids: UserServiceClient;

  constructor() {
    this.cfg = createServiceConfig(process.cwd());
    this.logger = createLogger(this.cfg.get('logger'));
  }

  async start(): Promise<void> {
    this.server = ldap.createServer({
      log: wrapLogger(this.logger),
      certificate: this.cfg.get('ldap:tls:certificate'),
      key: this.cfg.get('ldap:tls:key')
    });

    const channel = createChannel(this.cfg.get('client:user:address'));
    this.ids = createClient({
      logger: this.logger,
    }, UserServiceDefinition, channel)

    mountPaths(this.cfg, this.server, this.ids);

    await new Promise<void>((r) => {
      this.server.listen(this.cfg.get('ldap:port'), this.cfg.get('ldap:host'), () => {
        this.logger.info(`LDAP server listening at ${this.server.url}`);
        r();
      });
    });
  }

  async stop(): Promise<void> {
    this.logger.info(`Stopping LDAP server`);
    return new Promise(r => this.server.close(r));
  }

}
