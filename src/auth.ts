import { default as ldapjs } from "ldapjs";
import { User } from "@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/user.js";
import { Context } from "./utils.js";

export const testCredentials = async (ctx: Context, dn: ldapjs.DN, credentials: string): Promise<boolean> => {
  const bindDN = ldapjs.parseDN(ctx.cfg.get('ldap:bind:dn') + ',' + ctx.cfg.get('ldap:base_dn'));
  if (bindDN.equals(dn) && (credentials === ctx.cfg.get('ldap:bind:password').toString() || credentials === null)) {
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
    user = await ctx.userClient.login({
      password: credentials,
      identifier
    }).then(u => u.payload).catch((err) => {
      ctx.logger.error('failed logging in', err);
      return undefined;
    });
  } else {
    const users = await ctx.userClient.find({
      subject: {
        token: ctx.cfg.get('authentication:apiKey')
      },
      name: identifier
    }).catch((err) => {
      ctx.logger.error('failed logging in', err);
      return undefined;
    });

    user = users?.items?.[0]?.payload;
  }

  return !!user;
};

export const authorize = (ctx: Context) => {
  return async (req: any, res: any, next: any) => {
    if (await testCredentials(ctx, req.connection.ldap.bindDN, null)) {
      return next();
    }
    return next(new ldapjs.InsufficientAccessRightsError());
  };
};
