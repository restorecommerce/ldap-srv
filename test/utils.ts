import { Worker } from "../src/worker.js";
import { vi } from "vitest";
import { UserResponse, UserListResponse } from "@restorecommerce/rc-grpc-clients/dist/generated/io/restorecommerce/user.js";
import { default as ldapjs } from "ldapjs";

export const mockLogin = (server: Worker, username: string, password: string) => {
  const spyLogin = vi.spyOn(server.ids, 'login');

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

const users: UserResponse[] = [
  {
    payload: {
      name: 'foo'
    }
  },
  {
    payload: {
      name: 'bar',
      firstName: 'John',
      lastName: 'Doe',
      id: 'bar'
    }
  },
  {
    payload: {
      name: 'baz'
    }
  }
];

export const mockFind = (server: Worker) => {
  const spyLogin = vi.spyOn(server.ids, 'find');

  spyLogin.mockImplementationOnce(async (request, options) => {
    return {
      items: !request.name ? users : users.filter(user => user.payload.name === request.name)
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
