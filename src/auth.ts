import { Provider } from "nconf";
import { default as ldapjs } from "ldapjs";
import { User, UserServiceClient } from "@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/user.js";
import { Logger } from "@restorecommerce/logger";

export const testCredentials = async (cfg: Provider, dn: ldapjs.DN, credentials: string, ids: UserServiceClient, logger: Logger): Promise<boolean> => {
  const bindDN = ldapjs.parseDN(cfg.get('ldap:bind:dn') + ',' + cfg.get('ldap:base_dn'));
  if (bindDN.equals(dn) && (credentials === cfg.get('ldap:bind:password').toString() || credentials === null)) {
    return true;
  }

  let identifier = '';
  for (let i = 0; i < dn.length; i++) {
    if ((dn as any).rdnAt(i).has('cn')) {
      identifier = (dn as any).rdnAt(i).getValue('cn');
      break;
    }
  }

  if (!identifier || identifier === '') {
    return false;
  }

  let user: User | undefined;
  if (credentials !== null) {
    user = await ids.login({
      password: credentials,
      identifier
    }).then(u => u.payload).catch((err) => {
      logger.error('failed logging in', err);
      return undefined;
    });
  } else {
    const users = await ids.find({
      subject: {
        token: cfg.get('authentication:apiKey')
      },
      name: identifier
    }).catch((err) => {
      logger.error('failed logging in', err);
      return undefined;
    });

    user = users?.items?.[0]?.payload;
  }

  return !!user;
};

export const authorize = (cfg: Provider, ids: UserServiceClient, logger: Logger) => {
  return async (req: any, res: any, next: any) => {
    if (await testCredentials(cfg, req.connection.ldap.bindDN, null, ids, logger)) {
      return next();
    }
    return next(new ldapjs.InsufficientAccessRightsError());
  };
};
