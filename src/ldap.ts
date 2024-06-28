import { default as ldapjs, SearchRequest } from "ldapjs";
import { authorize, testCredentials } from "./auth.js";
import { allAttributeFix, Context, withLowercase } from "./utils.js";
import { getGroups, getUsers } from "./external.js";

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

export const mountPaths = (ctx: Context) => {
  bind(ctx);
  rootSearch(ctx);
  subschemaSearch(ctx);
  usersSearch(ctx);
  groupsSearch(ctx);
  baseSearch(ctx);
};

/**
 * Authenticates users with an identifier and password
 */
const bind = (ctx: Context) => {
  ctx.server.bind(ctx.cfg.get('ldap:base_dn'), async (req: any, res: any, next: any) => {
    let dn = (req.dn instanceof ldapjs.DN) ? req.dn : ldapjs.parseDN(req.dn);
    if (await testCredentials(ctx, dn, req.credentials)) {
      res.end();
      return next();
    }

    return next(new ldapjs.InvalidCredentialsError());
  });
};

/**
 * Returns the root base dn
 */
const rootSearch = (ctx: Context) => {
  ctx.server.search('', authorize(ctx), allAttributeFix(), (req: NewSearchRequest, res: any, next: any) => {
    if (req.dn && req.dn.toString() !== '') {
      return next();
    }

    res.send({
      dn: '',
      attributes: {
        ...commonAttributes,
        objectClass: ['top'],
        namingContexts: [ctx.cfg.get('ldap:base_dn')],
        rootDomainNamingContext: [ctx.cfg.get('ldap:base_dn')],
      }
    })

    return res.end();
  })
};

/**
 * Returns an empty subschema, which is required by some LDAP clients
 */
const subschemaSearch = (ctx: Context) => {
  ctx.server.search('cn=subschema', authorize(ctx), allAttributeFix(), (req: NewSearchRequest, res: any, next: any) => {
    res.send({
      dn: 'cn=subschema',
      attributes: {
        objectClass: ['top', 'subSchema']
      }
    });
    return res.end();
  })
};

/**
 * Returns objects within the base dn
 */
const baseSearch = (ctx: Context) => {
  ctx.server.search(ctx.cfg.get('ldap:base_dn'), authorize(ctx), allAttributeFix(), async (req: NewSearchRequest, res: any, next: any) => {
    const toSend: any[] = [];

    const base = {
      dn: ctx.cfg.get('ldap:base_dn'),
      attributes: {
        ...commonAttributes,
        objectClass: ['top'],
        namingContexts: [ctx.cfg.get('ldap:base_dn')],
        rootDomainNamingContext: [ctx.cfg.get('ldap:base_dn')],
      }
    };

    const ouUsers = {
      dn: 'ou=users,' + ctx.cfg.get('ldap:base_dn'),
      attributes: {
        objectClass: ['top', 'nsContainer'],
        distinguishedName: ['ou=users,' + req.dn.toString()],
        commonName: ['users']
      }
    };

    const ouGroups = {
      dn: 'ou=groups,' + ctx.cfg.get('ldap:base_dn'),
      attributes: {
        objectClass: ['top', 'nsContainer'],
        distinguishedName: ['ou=groups,' + req.dn.toString()],
        commonName: ['groups']
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
        toSend.push(ouGroups);
        break;
      case 2:
      case 'sub':
        if (req.dn.toString() === ctx.cfg.get('ldap:base_dn')) {
          toSend.push(base);
          toSend.push(ouUsers);
          toSend.push(ouGroups);
          toSend.push(...await getUsers(ctx));
          toSend.push(...await getGroups(ctx));
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

/**
 * Returns users objects
 */
const usersSearch = (ctx: Context) => {
  ctx.server.search('ou=users,' + ctx.cfg.get('ldap:base_dn'), authorize(ctx), allAttributeFix(), async (req: NewSearchRequest, res: any, next: any) => {
    const toSend: any[] = [];

    switch (req.scope as any) {
      case 0:
      case 'base':
        if (req.dn.childOf('ou=users,' + ctx.cfg.get('ldap:base_dn'))) {
          const name = req.dn.clone().shift().toString().substring(3);
          toSend.push(...await getUsers(ctx, name));
        } else {
          toSend.push({
            dn: 'ou=users,' + ctx.cfg.get('ldap:base_dn'),
            attributes: {
              objectClass: ['top', 'nsContainer'],
              distinguishedName: ['ou=users,' + ctx.cfg.get('ldap:base_dn')],
              commonName: ['users']
            }
          });
        }
        break;
      case 1:
      case 'one':
        if (req.dn.toString() === 'ou=users,' + ctx.cfg.get('ldap:base_dn')) {
          toSend.push(...await getUsers(ctx));
        }
        break;
      case 2:
      case 'sub':
        if (req.dn.toString() === 'ou=users,' + ctx.cfg.get('ldap:base_dn')) {
          toSend.push(...await getUsers(ctx));
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

/**
 * Returns groups objects
 */
const groupsSearch = (ctx: Context) => {
  ctx.server.search('ou=groups,' + ctx.cfg.get('ldap:base_dn'), authorize(ctx), allAttributeFix(), async (req: NewSearchRequest, res: any, next: any) => {
    const toSend: any[] = [];

    switch (req.scope as any) {
      case 0:
      case 'base':
        if (req.dn.childOf('ou=groups,' + ctx.cfg.get('ldap:base_dn'))) {
          const name = req.dn.clone().shift().toString().substring(3);
          toSend.push(...await getGroups(ctx, name));
        } else {
          toSend.push({
            dn: 'ou=groups,' + ctx.cfg.get('ldap:base_dn'),
            attributes: {
              objectClass: ['top', 'nsContainer'],
              distinguishedName: ['ou=groups,' + ctx.cfg.get('ldap:base_dn')],
              commonName: ['groups']
            }
          });
        }
        break;
      case 1:
      case 'one':
        if (req.dn.toString() === 'ou=groups,' + ctx.cfg.get('ldap:base_dn')) {
          toSend.push(...await getGroups(ctx));
        }
        break;
      case 2:
      case 'sub':
        if (req.dn.toString() === 'ou=groups,' + ctx.cfg.get('ldap:base_dn')) {
          toSend.push(...await getGroups(ctx));
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
