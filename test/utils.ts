import { Worker } from "../src/worker.js";
import { vi } from "vitest";
import { UserRoleResponse } from "@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/user.js";
import { RoleResponse } from "@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/role.js";
import { default as ldapjs } from "ldapjs";

export const mockLogin = (server: Worker, username: string, password: string) => {
  const spyLogin = vi.spyOn(server.ctx.userClient, 'login');

  spyLogin.mockImplementationOnce(async (request, options) => {
    if (request.identifier === username && request.password === password) {
      return {
        payload: {
          name: username
        }
      };
    }

    return {
      status: {
        code: 404,
        message: 'User not found'
      }
    };
  });
};

const users: UserRoleResponse[] = [
  {
    payload: {
      name: 'foo',
      roleAssociations: [
        {role: 'admin'},
        {role: 'user'}
      ]
    }
  },
  {
    payload: {
      name: 'bar',
      firstName: 'John',
      lastName: 'Doe',
      id: 'bar',
      roleAssociations: [
        {role: 'user'}
      ]
    }
  },
  {
    payload: {
      name: 'baz',
      roleAssociations: [
        {role: 'guest'}
      ]
    }
  }
];

const roles: RoleResponse[] = [
  {
    payload: {
      id: 'admin',
      name: 'Admin'
    }
  },
  {
    payload: {
      id: 'user',
      name: 'User'
    }
  },
  {
    payload: {
      id: 'guest',
      name: 'Guest'
    }
  }
];

export const mockFind = (server: Worker) => {
  const spyUserFind = vi.spyOn(server.ctx.userClient, 'find');
  spyUserFind.mockImplementation(async (request, options) => {
    return {
      items: !request.name ? users : users.filter(user => user.payload.name === request.name)
    };
  });

  const spyUserRead = vi.spyOn(server.ctx.userClient, 'read');
  spyUserRead.mockImplementation(async (request, options) => {
    return {
      items: users
    };
  });

  const spyRole = vi.spyOn(server.ctx.roleClient, 'read');
  spyRole.mockImplementation(async (request, options) => {
    return {
      items: !request.filters ? roles : roles.filter(role => role.payload.name === request.filters[0].filters[0].value)
    };
  });
};

export interface SearchResponse {
  entries: ldapjs.SearchEntryObject[];
  error: ldapjs.Error;
  result: ldapjs.SearchResultDone;
}

export const readResponse = async (res: ldapjs.SearchCallbackResponse): Promise<SearchResponse> => {
  return new Promise((r) => {
    const response: SearchResponse = {
      entries: [],
      result: undefined,
      error: undefined,
    };

    res.on('searchEntry', (entry) => {
      response.entries.push(entry.pojo);
    });

    res.on('error', (err) => {
      response.error = err;
    });

    res.on('end', (result) => {
      response.result = result;
      r(response);
    });
  });
}
