import { expect, it, describe, beforeAll, afterAll } from 'vitest';
import { Worker } from "../src/worker.js";
import { default as ldapjs } from "ldapjs";
import { wrapLogger } from "../src/logger.js";
import { mockFind, mockLogin, readResponse, SearchResponse } from "./utils.js";

let server: Worker;

const MOCK_USERNAME = "testUser";
const MOCK_PASSWORD  = "testPassword";

const getClient = (valid = false) => {
  return ldapjs.createClient({
    url: [server.server.url],
    log: wrapLogger(server.logger),
    bindDN: valid ? server.cfg.get('ldap:bind:dn') + ',' + server.cfg.get('ldap:base_dn') : undefined,
    bindCredentials: valid ? server.cfg.get('ldap:bind:password').toString() : undefined
  });
};

beforeAll(async () => {
  server = new Worker();
  await server.start();
  mockFind(server);
});

afterAll(async () => {
  server.stop();
});

describe('bind', () => {
  it('should fail with wrong user', async () => {
    const err = await new Promise<ldapjs.Error | null>(r => {
      getClient().bind('cn=hello', undefined, (err) => {
        r(err);
      });
    });

    expect(err).not.toBe(null);
  });

  it('should bind with config user', async () => {
    const err = await new Promise<ldapjs.Error | null>(r => {
      const user = server.cfg.get('ldap:bind:dn') + ',' + server.cfg.get('ldap:base_dn');
      getClient().bind(user, server.cfg.get('ldap:bind:password').toString(), (err) => {
        r(err);
      });
    });

    expect(err).toBe(null);
  });

  it('should fail with wrong IDS password', async () => {
    const err = await new Promise<ldapjs.Error | null>(r => {
      mockLogin(server, MOCK_USERNAME, MOCK_PASSWORD);
      getClient().bind(`cn=${MOCK_USERNAME},ou=Users,${server.cfg.get('ldap:base_dn')}`, 'world', (err) => {
        r(err);
      });
    });

    expect(err).not.toBe(null);
  });

  it('should fail with wrong IDS username', async () => {
    const err = await new Promise<ldapjs.Error | null>(r => {
      mockLogin(server, MOCK_USERNAME, MOCK_PASSWORD);
      getClient().bind(`cn=hello,ou=Users,${server.cfg.get('ldap:base_dn')}`, MOCK_PASSWORD, (err) => {
        r(err);
      });
    });

    expect(err).not.toBe(null);
  });

  it('should bind with IDS user', async () => {
    const err = await new Promise<ldapjs.Error | null>(r => {
      mockLogin(server, MOCK_USERNAME, MOCK_PASSWORD);
      getClient().bind(`cn=${MOCK_USERNAME},ou=Users,${server.cfg.get('ldap:base_dn')}`, MOCK_PASSWORD, (err) => {
        r(err);
      });
    });

    expect(err).toBe(null);
  });
});

describe('search', () => {
  describe('base', () => {
    it('should find root', async () => {
      const response = await new Promise<SearchResponse>(r => {
        const client = getClient(true);
        client.search('', {}, async (err, res) => {
          r(await readResponse(res));
        })
      });

      expect(response.error).toBe(undefined);
      expect(response.entries).not.toBe(undefined);
      expect(response.entries[0].attributes).toContainEqual({
        type: 'namingContexts',
        values: [server.cfg.get('ldap:base_dn')]
      });
    });

    it('should find cn=subschema', async () => {
      const response = await new Promise<SearchResponse>(r => {
        const client = getClient(true);
        client.search('cn=subschema', {}, async (err, res) => {
          r(await readResponse(res));
        })
      });

      expect(response.error).toBe(undefined);
      expect(response.entries).not.toBe(undefined);
      expect(response.entries[0].attributes).toContainEqual({
        type: 'objectClass',
        values: ['top', 'subSchema']
      });
    });

    it('should find base', async () => {
      const response = await new Promise<SearchResponse>(r => {
        const client = getClient(true);
        client.search(server.cfg.get('ldap:base_dn'), {}, async (err, res) => {
          r(await readResponse(res));
        })
      });

      expect(response.error).toBe(undefined);
      expect(response.entries).not.toBe(undefined);
      expect(response.entries[0].attributes).toContainEqual({
        type: 'namingContexts',
        values: [server.cfg.get('ldap:base_dn')]
      });
    });

    it('should find base children', async () => {
      const response = await new Promise<SearchResponse>(r => {
        const client = getClient(true);
        client.search(server.cfg.get('ldap:base_dn'), {scope: 'one'}, async (err, res) => {
          r(await readResponse(res));
        })
      });

      expect(response.error).toBe(undefined);
      expect(response.entries).not.toBe(undefined);
      expect(response.entries[0].attributes).toContainEqual({
        type: 'commonName',
        values: ['users']
      });
      expect(response.entries[1].attributes).toContainEqual({
        type: 'commonName',
        values: ['groups']
      });
    });

    it('should find all sub-items', async () => {
      const response = await new Promise<SearchResponse>(r => {
        const client = getClient(true);
        client.search(server.cfg.get('ldap:base_dn'), {
          scope: 'sub'
        }, async (err, res) => {
          r(await readResponse(res));
        })
      });

      console.log(response.entries)
      expect(response.error).toBe(undefined);
      expect(response.entries).not.toBe(undefined);
      expect(response.entries).lengthOf(9);
    });
  });

  describe('user', () => {
    it('should find list of users', async () => {
      const response = await new Promise<SearchResponse>(r => {
        const client = getClient(true);
        client.search('ou=users,' + server.cfg.get('ldap:base_dn'), {scope: 'one'}, async (err, res) => {
          r(await readResponse(res));
        })
      });

      expect(response.error).toBe(undefined);
      expect(response.entries).not.toBe(undefined);
      expect(response.entries[0].objectName).toEqual('cn=bar,ou=users,' + server.cfg.get('ldap:base_dn'));
    });

    it('should find a single user', async () => {
      const response = await new Promise<SearchResponse>(r => {
        const client = getClient(true);
        client.search('cn=bar,ou=users,' + server.cfg.get('ldap:base_dn'), {}, async (err, res) => {
          r(await readResponse(res));
        })
      });

      expect(response.error).toBe(undefined);
      expect(response.entries).not.toBe(undefined);
      expect(response.entries[0].attributes).toContainEqual({
        type: 'displayName',
        values: ['John Doe']
      });
      expect(response.entries[0].attributes).toContainEqual({
        type: 'memberOf',
        values: ['cn=User,ou=groups,' + server.cfg.get('ldap:base_dn')]
      });
    });

    it('should filter users by group', async () => {
      const response = await new Promise<SearchResponse>(r => {
        const client = getClient(true);
        client.search('ou=users,' + server.cfg.get('ldap:base_dn'), {
          scope: 'sub',
          filter: `(|(memberOf=cn=User,ou=groups,${server.cfg.get('ldap:base_dn')}))`
        }, async (err, res) => {
          r(await readResponse(res));
        })
      });

      expect(response.error).toBe(undefined);
      expect(response.entries).not.toBe(undefined);
      expect(response.entries).lengthOf(2);
      expect(response.entries[0].attributes).toContainEqual({
        type: 'displayName',
        values: ['John Doe']
      });
    });
  });

  describe('group', () => {
    it('should find list of groups', async () => {
      const response = await new Promise<SearchResponse>(r => {
        const client = getClient(true);
        client.search('ou=groups,' + server.cfg.get('ldap:base_dn'), {scope: 'one'}, async (err, res) => {
          r(await readResponse(res));
        })
      });

      expect(response.error).toBe(undefined);
      expect(response.entries).not.toBe(undefined);
      expect(response.entries[0].objectName).toEqual('cn=Admin,ou=groups,' + server.cfg.get('ldap:base_dn'));
    });

    it('should find a single group', async () => {
      const response = await new Promise<SearchResponse>(r => {
        const client = getClient(true);
        client.search('cn=User,ou=groups,' + server.cfg.get('ldap:base_dn'), {}, async (err, res) => {
          r(await readResponse(res));
        })
      });

      expect(response.error).toBe(undefined);
      expect(response.entries).not.toBe(undefined);
      expect(response.entries[0].attributes).toContainEqual({
        type: 'id',
        values: ['user']
      });
      expect(response.entries[0].attributes).toContainEqual({
        type: 'member',
        values: [
          'cn=foo,ou=users,' + server.cfg.get('ldap:base_dn'),
          'cn=bar,ou=users,' + server.cfg.get('ldap:base_dn')
        ]
      });
    });
  });
});
