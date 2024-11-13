// Fixes a bug where case-sensitive requests get lowercased and attributes don't get sent
// https://github.com/ldapjs/node-ldapjs/pull/971
//
// We just add all the same attributes but lowercased to the requested ones
import { UserServiceClient } from "@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/user.js";
import { RoleServiceClient } from "@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/role.js";
import { Provider } from "nconf";
import { Logger } from "@restorecommerce/logger";
import ldap from 'ldapjs';

export const allAttributeFix = () => {
  return (req: any, res: any, next: any) => {
    res.attributes = [
      ...res.attributes,
      ...res.attributes.map((s: string) => s.toLowerCase())
    ];
    return next();
  };
};

export const withLowercase = (obj: any) => {
    return {
      ...obj,
      ...Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]))
    };
};

export interface Context {
  cfg: Provider;
  logger: Logger;
  server: ldap.Server;
  userClient: UserServiceClient;
  roleClient: RoleServiceClient;
}

export const serializeKeys = <T>(obj: T): T => {
  const out: any = {
    ...obj
  };

  for (const key of Object.keys(out)) {
    if (typeof out[key] === 'object') {
      if (Array.isArray(out[key])) {
        if (!(out[key].length > 0 && typeof out[key][0] !== 'object')) {
          out[key] = out[key].map(JSON.stringify);
        }
      } else {
        out[key] = JSON.stringify(out[key]);
      }
    }
  }

  return out;
};
