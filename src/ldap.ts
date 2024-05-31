import { type Server, default as ldapjs, SearchRequest } from "ldapjs";
import { Provider } from "nconf";
import {
  UserListResponse,
  UserServiceClient
} from "@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/user.js";
import { authorize, testCredentials } from "./auth.js";
import { allAttributeFix, withLowercase } from "./utils.js";
import { Logger } from "@restorecommerce/logger";

interface NewSearchRequest extends SearchRequest {
  dn: ldapjs.DN;
}

const commonAttributes: Record<string, string[]> = {
  supportedCapabilities: ['1.2.840.113556.1.4.800', '1.2.840.113556.1.4.1791', '1.2.840.113556.1.4.1670', '1.2.840.113556.1.4.1880', '1.2.840.113556.1.4.1851', '1.2.840.113556.1.4.1920', '1.2.840.113556.1.4.1935', '1.2.840.113556.1.4.2080', '1.2.840.113556.1.4.2237'],
  supportedControl: ['2.16.840.1.113730.3.4.9', '2.16.840.1.113730.3.4.10', '1.2.840.113556.1.4.474', '1.2.840.113556.1.4.319'],
  subschemaSubentry: ['cn=subschema'],
  supportedLDAPVersion: ['3'],
  vendorName: ['restorecommerce.io'],
  vendorVersion: ['restorecommerce LDAP service'],
  entryDN: [''],
};

export const mountPaths = (cfg: Provider, server: Server, ids: UserServiceClient, logger: Logger) => {
  bind(cfg, server, ids, logger);
  rootSearch(cfg, server, ids, logger);
  subschemaSearch(cfg, server, ids, logger);
  usersSearch(cfg, server, ids, logger);
  baseSearch(cfg, server, ids, logger);
};

const sendUsers = async (ids: UserServiceClient, cfg: Provider, name?: string): Promise<any[]> => {
  const userList = await ids.find({
    subject: {
      token: cfg.get('apiKey')
    },
    name
  }).catch(() => UserListResponse.fromPartial({}));

  if (!userList || !userList.items || userList.items.length === 0) {
    return;
  }

  const toSend: any[] = [];
  for (const user of userList.items) {
    const attributes = {
      cn: (user.payload as any)[cfg.get('ldap:user_cn_field')],
      objectClass: ['top', 'person', 'organizationalPerson', 'inetOrgPerson', 'user', 'posixAccount'],
      ...user.payload,
      displayName: user.payload.firstName + ' ' + user.payload.lastName,
      homeDirectory: `/home/${user.payload.id}`,
      uid: user.payload.id,
    };

    for (const field of cfg.get('ldap:removed_fields')) {
      delete (attributes as any)[field];
    }

    for (let key of Object.keys(attributes)) {
      if (typeof (attributes as any)[key] === 'object') {
        if (Array.isArray((attributes as any)[key])) {
          if (!((attributes as any)[key].length > 0 && typeof (attributes as any)[key][0] !== 'object')) {
            (attributes as any)[key] = (attributes as any)[key].map(JSON.stringify);
          }
        } else {
          (attributes as any)[key] = JSON.stringify((attributes as any)[key]);
        }
      }
    }

    toSend.push({
      dn: `cn=${(user.payload as any)[cfg.get('ldap:user_cn_field')]},ou=users,${cfg.get('ldap:base_dn')}`,
      attributes
    });
  }

  return toSend;
}

const bind = (cfg: Provider, server: Server, ids: UserServiceClient, logger: Logger) => {
  server.bind(cfg.get('ldap:base_dn'), async (req: any, res: any, next: any) => {
    let dn = (req.dn instanceof ldapjs.DN) ? req.dn : ldapjs.parseDN(req.dn);
    if (await testCredentials(cfg, dn, req.credentials, ids, logger)) {
      res.end();
      return next();
    }

    return next(new ldapjs.InvalidCredentialsError());
  });
};

const rootSearch = (cfg: Provider, server: Server, ids: UserServiceClient, logger: Logger) => {
  server.search('', authorize(cfg, ids, logger), allAttributeFix(), (req: NewSearchRequest, res: any, next: any) => {
    if (req.dn && req.dn.toString() !== '') {
      return next();
    }

    res.send({
      dn: '',
      attributes: {
        ...commonAttributes,
        objectClass: ['top'],
        namingContexts: [cfg.get('ldap:base_dn')],
        rootDomainNamingContext: [cfg.get('ldap:base_dn')],
      }
    })

    return res.end();
  })
};

const subschemaSearch = (cfg: Provider, server: Server, ids: UserServiceClient, logger: Logger) => {
  server.search('cn=subschema', authorize(cfg, ids, logger), allAttributeFix(), (req: NewSearchRequest, res: any, next: any) => {
    res.send({
      dn: 'cn=subschema',
      attributes: {
        objectClass: ['top', 'subSchema']
      }
    });
    return res.end();
  })
};

const baseSearch = (cfg: Provider, server: Server, ids: UserServiceClient, logger: Logger) => {
  server.search(cfg.get('ldap:base_dn'), authorize(cfg, ids, logger), allAttributeFix(), async (req: NewSearchRequest, res: any, next: any) => {
    const toSend: any[] = [];

    const base = {
      dn: cfg.get('ldap:base_dn'),
      attributes: {
        ...commonAttributes,
        objectClass: ['top'],
        namingContexts: [cfg.get('ldap:base_dn')],
        rootDomainNamingContext: [cfg.get('ldap:base_dn')],
      }
    };

    const ouUsers = {
      dn: 'ou=users,' + cfg.get('ldap:base_dn'),
      attributes: {
        objectClass: ['top', 'nsContainer'],
        distinguishedName: ['ou=users,' + req.dn.toString()],
        commonName: ['users']
      }
    };

    switch (req.scope as any) {
      case 0:
      case 'base':
        toSend.push(base);
        break;
      case 1:
      case 'one':
        toSend.push(ouUsers);
        break;
      case 2:
      case 'sub':
        if (req.dn.toString() === cfg.get('ldap:base_dn')) {
          toSend.push(base);
          toSend.push(ouUsers);
          toSend.push(...await sendUsers(ids, cfg));
        }
        break;
    }

    toSend.forEach(entity => {
      if (!req.filter || req.filter.matches(withLowercase(entity.attributes))) {
        res.send(entity);
      }
    });

    return res.end();
  })
};

const usersSearch = (cfg: Provider, server: Server, ids: UserServiceClient, logger: Logger) => {
  server.search('ou=users,' + cfg.get('ldap:base_dn'), authorize(cfg, ids, logger), allAttributeFix(), async (req: NewSearchRequest, res: any, next: any) => {
    const toSend: any[] = [];

    switch (req.scope as any) {
      case 0:
      case 'base':
        if (req.dn.childOf('ou=users,' + cfg.get('ldap:base_dn'))) {
          const name = req.dn.clone().shift().toString().substring(3);
          toSend.push(...await sendUsers(ids, cfg, name));
        } else {
          toSend.push({
            dn: 'ou=users,' + cfg.get('ldap:base_dn'),
            attributes: {
              objectClass: ['top', 'nsContainer'],
              distinguishedName: ['ou=users,' + cfg.get('ldap:base_dn')],
              commonName: ['users']
            }
          });
        }
        break;
      case 1:
      case 'one':
        if (req.dn.toString() === 'ou=users,' + cfg.get('ldap:base_dn')) {
          toSend.push(...await sendUsers(ids, cfg));
        }
        break;
      case 2:
      case 'sub':
        if (req.dn.toString() === 'ou=users,' + cfg.get('ldap:base_dn')) {
          toSend.push(...await sendUsers(ids, cfg));
        }
        break;
    }

    toSend.forEach(entity => {
      if (!req.filter || req.filter.matches(withLowercase(entity.attributes))) {
        res.send(entity);
      }
    });

    return res.end();
  })
};
