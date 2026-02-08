/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock typescript-memoize before import
jest.mock('typescript-memoize', () => ({
  MemoizeExpiring: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
}));

// Mock typescript-retry-decorator before import
jest.mock('typescript-retry-decorator', () => ({
  Retryable: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
  BackOffPolicy: { ExponentialBackOffPolicy: 'ExponentialBackOffPolicy' },
}));

// Mock axios module
const mockAuthPost = jest.fn();
const mockNoAuthPost = jest.fn();
const mockRequestInterceptorUse = jest.fn();
jest.mock('axios', () => {
  let callCount = 0;
  const axiosMock: any = {
    create: jest.fn(() => {
      callCount++;
      if (callCount % 2 === 1) {
        // Authenticated instance (first call)
        return {
          post: mockAuthPost,
          interceptors: {
            request: { use: mockRequestInterceptorUse },
            response: { use: jest.fn() },
          },
        };
      }
      // No-auth instance (second call)
      return {
        post: mockNoAuthPost,
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      };
    }),
    post: jest.fn(),
    isAxiosError: jest.fn(() => false),
  };
  return { __esModule: true, default: axiosMock };
});

import { InfinityGraphQLClient } from './graphql_client';
import { mockLogger } from '../__mocks__/homebridge';

function makeLoginResponse(overrides: any = {}) {
  return {
    data: {
      data: {
        assistedLogin: {
          success: true,
          status: 'ok',
          errorMessage: null,
          data: {
            token_type: 'Bearer',
            expires_in: 3600,
            access_token: 'access-token',
            scope: 'offline_access',
            refresh_token: 'refresh-token',
          },
          ...overrides,
        },
      },
    },
  };
}

describe('InfinityGraphQLClient', () => {
  let client: InfinityGraphQLClient;
  let log: any;

  beforeEach(() => {
    jest.clearAllMocks();
    log = mockLogger();
    client = new InfinityGraphQLClient('testuser', 'testpass', log);
  });

  describe('constructor', () => {
    test('stores username and password', () => {
      expect(client.username).toBe('testuser');
    });

    test('registers request interceptor for Bearer token', () => {
      expect(mockRequestInterceptorUse).toHaveBeenCalledTimes(1);
    });
  });

  describe('refreshToken / forceRefreshToken', () => {
    test('acquires tokens via assistedLogin when no refresh token exists', async () => {
      mockNoAuthPost.mockResolvedValueOnce(makeLoginResponse());

      await client.refreshToken();

      expect(mockNoAuthPost).toHaveBeenCalledWith('', {
        query: expect.stringContaining('assistedLogin'),
        variables: { input: { username: 'testuser', password: 'testpass' } },
      });
      expect(log.info).toHaveBeenCalledWith(expect.stringContaining('login / token refresh successfully'));
    });

    test('throws when assistedLogin returns success=false', async () => {
      mockNoAuthPost.mockResolvedValueOnce(makeLoginResponse({
        success: false,
        errorMessage: 'Invalid credentials',
        data: null,
      }));

      await expect(client.refreshToken()).rejects.toThrow('assistedLogin failed');
    });

    test('throws when response has GraphQL errors', async () => {
      mockNoAuthPost.mockResolvedValueOnce({
        data: { errors: [{ message: 'Internal server error' }] },
      });

      await expect(client.refreshToken()).rejects.toThrow('GraphQL errors during login');
    });

    test('throws when access_token is missing', async () => {
      mockNoAuthPost.mockResolvedValueOnce(makeLoginResponse({
        data: {
          token_type: 'Bearer', expires_in: 3600,
          access_token: '', scope: 'offline_access', refresh_token: 'rt',
        },
      }));

      await expect(client.refreshToken()).rejects.toThrow('did not return access_token');
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      // Use persistent mock so re-auth from query() also succeeds
      mockNoAuthPost.mockResolvedValue(makeLoginResponse());
      await client.refreshToken();
    });

    afterEach(() => {
      mockNoAuthPost.mockReset();
    });

    test('sends POST with query and variables, returns data', async () => {
      const mockData = { infinitySystems: [{ profile: { serial: 'ABC' } }] };
      mockAuthPost.mockResolvedValueOnce({ data: { data: mockData } });

      const result = await client.query('query { test }', { foo: 'bar' });

      expect(mockAuthPost).toHaveBeenCalledWith('', {
        query: 'query { test }',
        variables: { foo: 'bar' },
      });
      expect(result).toEqual(mockData);
    });

    test('throws on GraphQL errors', async () => {
      mockAuthPost.mockResolvedValueOnce({
        data: { errors: [{ message: 'Unauthorized' }], data: null },
      });

      await expect(client.query('query { test }')).rejects.toThrow('GraphQL query errors');
    });

    test('throws when data is null', async () => {
      mockAuthPost.mockResolvedValueOnce({ data: { data: null } });

      await expect(client.query('query { test }')).rejects.toThrow('returned no data');
    });
  });

  describe('mutate', () => {
    beforeEach(async () => {
      mockNoAuthPost.mockResolvedValue(makeLoginResponse());
      await client.refreshToken();
    });

    afterEach(() => {
      mockNoAuthPost.mockReset();
    });

    test('sends POST with mutation and variables, returns data', async () => {
      const mockResult = { updateInfinityConfig: { etag: 'new-etag' } };
      mockAuthPost.mockResolvedValueOnce({ data: { data: mockResult } });

      const result = await client.mutate('mutation { test }', { input: { mode: 'cool' } });

      expect(mockAuthPost).toHaveBeenCalledWith('', {
        query: 'mutation { test }',
        variables: { input: { mode: 'cool' } },
      });
      expect(result).toEqual(mockResult);
    });

    test('throws on GraphQL errors', async () => {
      mockAuthPost.mockResolvedValueOnce({
        data: { errors: [{ message: 'Validation error' }], data: null },
      });

      await expect(client.mutate('mutation { test }')).rejects.toThrow('GraphQL mutation errors');
    });

    test('throws when data is null', async () => {
      mockAuthPost.mockResolvedValueOnce({ data: { data: null } });

      await expect(client.mutate('mutation { test }')).rejects.toThrow('returned no data');
    });
  });
});
