import { UserListResponse, } from "@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/user.js";
import { Role, RoleListResponse } from "@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/role.js";
import { Context, serializeKeys } from "./utils.js";

export const getUsers = async (ctx: Context, name?: string): Promise<any[]> => {
  const userList = await ctx.userClient.find({
    subject: {
      token: ctx.cfg.get('authentication:apiKey')
    },
    name
  }).catch(() => UserListResponse.fromPartial({}));

  if (!userList || !userList.items || userList.items.length === 0) {
    return [];
  }

  const allRoles = await ctx.roleClient.read({
    subject: {
      token: ctx.cfg.get('authentication:apiKey')
    },
  });

  const idToRole = allRoles?.items?.reduce((prev, role) => {
    return {
      ...prev,
      [role.payload.id]: role.payload
    };
  }, {} as Record<string, Role>);

  const toSend: any[] = [];
  for (const user of userList.items) {
    let attributes: any = {
      cn: (user.payload as any)[ctx.cfg.get('ldap:user_cn_field')],
      objectClass: ['top', 'person', 'organizationalPerson', 'inetOrgPerson', 'user', 'posixAccount'],
      ...user.payload,
      displayName: user.payload.firstName + ' ' + user.payload.lastName,
      homeDirectory: `/home/${user.payload.id}`,
      uid: user.payload.id,
    };

    if (user.payload.roleAssociations && user.payload.roleAssociations.length > 0) {
      attributes.memberOf = user.payload.roleAssociations.map((assoc) => {
        if (!(assoc.role in idToRole)) {
          throw new Error(`Role ${assoc.role} does not exist. Found in user ${user.payload.name}`);
        }
        return `cn=${(idToRole[assoc.role] as any)[ctx.cfg.get('ldap:group_cn_field')]},ou=groups,${ctx.cfg.get('ldap:base_dn')}`;
      });
    }

    // Some servers just want one of these
    for (const idAttribute of ['entryuuid', 'nsuniqueid', 'objectguid', 'guid', 'ipauniqueid']) {
      attributes[idAttribute] = user.payload.id;
    }

    for (const field of ctx.cfg.get('ldap:removed_fields')) {
      delete attributes[field];
    }

    attributes = serializeKeys(attributes);

    toSend.push({
      dn: `cn=${(user.payload as any)[ctx.cfg.get('ldap:user_cn_field')]},ou=users,${ctx.cfg.get('ldap:base_dn')}`,
      attributes
    });
  }

  toSend.sort((a, b) => a.dn.localeCompare(b.dn));

  return toSend;
}

export const getGroups = async (ctx: Context, name?: string): Promise<any[]> => {
  const roleList = await ctx.roleClient.read({
    subject: {
      token: ctx.cfg.get('authentication:apiKey')
    },
  }).catch(() => RoleListResponse.fromPartial({}));

  if (name) {
    roleList.items = roleList.items?.filter(r => r.payload.name === name);
  }

  if (!roleList || !roleList.items || roleList.items.length === 0) {
    return [];
  }

  const allUsers = await ctx.userClient.read({
    subject: {
      token: ctx.cfg.get('authentication:apiKey')
    },
  });

  const toSend: any[] = [];
  for (const role of roleList.items) {
    let attributes: any = {
      cn: (role.payload as any)[ctx.cfg.get('ldap:group_cn_field')],
      objectClass: ['top', 'group', 'groupOfNames', 'groupOfUniqueNames', 'posixGroup'],
      ...role.payload,
      uid: role.payload.id,
    };

    attributes.member = allUsers.items.filter((u) => {
      return !!u?.payload?.roleAssociations?.find((r) => r?.role === role.payload.id);
    }).map((user) => {
      return `cn=${(user.payload as any)[ctx.cfg.get('ldap:user_cn_field')]},ou=users,${ctx.cfg.get('ldap:base_dn')}`;
    });

    // Some servers just want one of these
    for (const idAttribute of ['entryuuid', 'nsuniqueid', 'objectguid', 'guid', 'ipauniqueid']) {
      attributes[idAttribute] = role.payload.id;
    }

    for (const field of ctx.cfg.get('ldap:removed_fields')) {
      delete attributes[field];
    }

    attributes = serializeKeys(attributes);

    toSend.push({
      dn: `cn=${(role.payload as any)[ctx.cfg.get('ldap:group_cn_field')]},ou=groups,${ctx.cfg.get('ldap:base_dn')}`,
      attributes
    });
  }

  toSend.sort((a, b) => a.dn.localeCompare(b.dn));

  return toSend;
}
