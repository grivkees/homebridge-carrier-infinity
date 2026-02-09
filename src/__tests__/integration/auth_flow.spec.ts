/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Integration tests for authentication flows.
 *
 * Uses a real InfinityGraphQLClient instance and only mocks at the HTTP
 * boundary (Axios) to validate the full auth lifecycle:
 *   login -> token storage -> authenticated requests -> token refresh
 */

// Mock decorators before any import so the class definition sees them.
jest.mock('typescript-memoize', () => ({
  MemoizeExpiring: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
}));
jest.mock('typescript-retry-decorator', () => ({
  Retryable: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
  BackOffPolicy: { ExponentialBackOffPolicy: 'ExponentialBackOffPolicy' },
}));

// Axios mock: two create() calls per constructor (auth then no-auth),
// plus a static Axios.post used by refreshTokenViaOkta().
const mockAuthPost = jest.fn();
const mockNoAuthPost = jest.fn();
const mockAxiosPost = jest.fn();
let capturedRequestInterceptor: (config: any) => any;

jest.mock('axios', () => {
  let callCount = 0;
  const axiosMock: any = {
    create: jest.fn(() => {
      callCount++;
      if (callCount % 2 === 1) {
        // Authenticated instance (odd calls)
        return {
          post: mockAuthPost,
          interceptors: {
            request: {
              use: jest.fn((fn: (config: any) => any) => {
                capturedRequestInterceptor = fn;
              }),
            },
            response: { use: jest.fn() },
          },
        };
      }
      // No-auth instance (even calls)
      return {
        post: mockNoAuthPost,
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      };
    }),
    post: mockAxiosPost,
    isAxiosError: jest.fn(() => false),
  };
  return { __esModule: true, default: axiosMock };
});

import { InfinityGraphQLClient } from '../../api/graphql_client';
import { mockLogger } from '../../__mocks__/homebridge';

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function makeLoginResponse(token = 'test-access-token', refresh = 'test-refresh-token') {
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
            access_token: token,
            scope: 'offline_access',
            refresh_token: refresh,
          },
        },
      },
    },
  };
}

function makeOktaRefreshResponse(token = 'refreshed-access-token', refresh?: string) {
  return {
    data: {
      token_type: 'Bearer',
      expires_in: 3600,
      access_token: token,
      scope: 'offline_access',
      ...(refresh ? { refresh_token: refresh } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Auth flow integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Login flow
  // -----------------------------------------------------------------------
  describe('login flow', () => {
    test('initial login acquires tokens via assistedLogin', async () => {
      mockNoAuthPost.mockResolvedValueOnce(makeLoginResponse('my-token', 'my-refresh'));
      const client = new InfinityGraphQLClient('user', 'pass', mockLogger() as any);

      await client.refreshToken();

      expect(mockNoAuthPost).toHaveBeenCalledTimes(1);
      expect(mockNoAuthPost).toHaveBeenCalledWith('', expect.objectContaining({
        query: expect.stringContaining('assistedLogin'),
        variables: { input: { username: 'user', password: 'pass' } },
      }));
    });

    test('authenticated requests include Bearer token after login', async () => {
      mockNoAuthPost.mockResolvedValueOnce(makeLoginResponse('my-access-token', 'my-refresh'));
      const client = new InfinityGraphQLClient('user', 'pass', mockLogger() as any);

      await client.refreshToken();

      // The constructor registered a request interceptor; exercise it.
      expect(capturedRequestInterceptor).toBeDefined();
      const config = { headers: {} } as any;
      const result = capturedRequestInterceptor(config);
      expect(result.headers['Authorization']).toBe('Bearer my-access-token');
    });

    test('query sends authenticated POST after login', async () => {
      mockNoAuthPost.mockResolvedValue(makeLoginResponse('qt', 'rt'));
      const client = new InfinityGraphQLClient('user', 'pass', mockLogger() as any);

      const queryData = { infinitySystems: [{ profile: { serial: 'SN123' } }] };
      mockAuthPost.mockResolvedValueOnce({ data: { data: queryData } });

      const result = await client.query('query { test }');

      expect(mockAuthPost).toHaveBeenCalledWith('', {
        query: 'query { test }',
        variables: undefined,
      });
      expect(result).toEqual(queryData);
    });

    test('mutate sends authenticated POST after login', async () => {
      mockNoAuthPost.mockResolvedValue(makeLoginResponse());
      const client = new InfinityGraphQLClient('user', 'pass', mockLogger() as any);

      const mutationResult = { updateInfinityConfig: { etag: 'e1' } };
      mockAuthPost.mockResolvedValueOnce({ data: { data: mutationResult } });

      const result = await client.mutate('mutation { update }', { input: { mode: 'cool' } });

      expect(mockAuthPost).toHaveBeenCalledWith('', {
        query: 'mutation { update }',
        variables: { input: { mode: 'cool' } },
      });
      expect(result).toEqual(mutationResult);
    });
  });

  // -----------------------------------------------------------------------
  // Token refresh flow
  // -----------------------------------------------------------------------
  describe('token refresh flow', () => {
    test('uses Okta refresh when refresh token available and not expired', async () => {
      // First login sets refresh_token + token_expires_in
      mockNoAuthPost.mockResolvedValueOnce(makeLoginResponse('initial-token', 'initial-refresh'));
      const client = new InfinityGraphQLClient('user', 'pass', mockLogger() as any);
      await client.refreshToken();

      // Second call: token not expired (just acquired), so Okta path is taken
      mockAxiosPost.mockResolvedValueOnce(makeOktaRefreshResponse('refreshed-token'));
      await client.refreshToken();

      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.stringContaining('token'),
        expect.objectContaining({
          grant_type: 'refresh_token',
          refresh_token: 'initial-refresh',
        }),
        expect.any(Object),
      );
    });

    test('updates access token after Okta refresh', async () => {
      mockNoAuthPost.mockResolvedValueOnce(makeLoginResponse('old-token', 'old-refresh'));
      const client = new InfinityGraphQLClient('user', 'pass', mockLogger() as any);
      await client.refreshToken();

      // Okta returns a new token
      mockAxiosPost.mockResolvedValueOnce(makeOktaRefreshResponse('new-token'));
      await client.refreshToken();

      // Interceptor should now inject the updated token
      const config = { headers: {} } as any;
      capturedRequestInterceptor(config);
      expect(config.headers['Authorization']).toBe('Bearer new-token');
    });

    test('updates refresh token when Okta returns one', async () => {
      mockNoAuthPost.mockResolvedValueOnce(makeLoginResponse('tok1', 'ref1'));
      const client = new InfinityGraphQLClient('user', 'pass', mockLogger() as any);
      await client.refreshToken();

      // Okta returns a rotated refresh token
      mockAxiosPost.mockResolvedValueOnce(makeOktaRefreshResponse('tok2', 'ref2'));
      await client.refreshToken();

      // Third refresh should send the rotated refresh token
      mockAxiosPost.mockResolvedValueOnce(makeOktaRefreshResponse('tok3'));
      await client.refreshToken();

      expect(mockAxiosPost).toHaveBeenLastCalledWith(
        expect.stringContaining('token'),
        expect.objectContaining({
          refresh_token: 'ref2',
        }),
        expect.any(Object),
      );
    });

    test('keeps old refresh token when Okta omits it', async () => {
      mockNoAuthPost.mockResolvedValueOnce(makeLoginResponse('tok1', 'original-refresh'));
      const client = new InfinityGraphQLClient('user', 'pass', mockLogger() as any);
      await client.refreshToken();

      // Okta response without refresh_token field
      mockAxiosPost.mockResolvedValueOnce(makeOktaRefreshResponse('tok2'));
      await client.refreshToken();

      // Third call should still use the original refresh token
      mockAxiosPost.mockResolvedValueOnce(makeOktaRefreshResponse('tok3'));
      await client.refreshToken();

      expect(mockAxiosPost).toHaveBeenLastCalledWith(
        expect.stringContaining('token'),
        expect.objectContaining({
          refresh_token: 'original-refresh',
        }),
        expect.any(Object),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Refresh fallback
  // -----------------------------------------------------------------------
  describe('refresh fallback', () => {
    test('falls back to assistedLogin when Okta refresh fails', async () => {
      // Initial login
      mockNoAuthPost.mockResolvedValueOnce(makeLoginResponse('token1', 'refresh1'));
      const client = new InfinityGraphQLClient('user', 'pass', mockLogger() as any);
      await client.refreshToken();

      // Okta fails, assistedLogin should be the fallback
      mockAxiosPost.mockRejectedValueOnce(new Error('Okta unavailable'));
      mockNoAuthPost.mockResolvedValueOnce(makeLoginResponse('token2', 'refresh2'));

      await client.refreshToken();

      // Both paths were attempted
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
      expect(mockNoAuthPost).toHaveBeenCalledTimes(2); // initial + fallback
    });

    test('uses assistedLogin token after fallback', async () => {
      mockNoAuthPost.mockResolvedValueOnce(makeLoginResponse('token1', 'refresh1'));
      const client = new InfinityGraphQLClient('user', 'pass', mockLogger() as any);
      await client.refreshToken();

      mockAxiosPost.mockRejectedValueOnce(new Error('Okta fail'));
      mockNoAuthPost.mockResolvedValueOnce(makeLoginResponse('fallback-token', 'fallback-refresh'));
      await client.refreshToken();

      const config = { headers: {} } as any;
      capturedRequestInterceptor(config);
      expect(config.headers['Authorization']).toBe('Bearer fallback-token');
    });

    test('subsequent refresh uses new refresh token from fallback', async () => {
      mockNoAuthPost.mockResolvedValueOnce(makeLoginResponse('token1', 'refresh1'));
      const client = new InfinityGraphQLClient('user', 'pass', mockLogger() as any);
      await client.refreshToken();

      // Okta fails, fallback provides new refresh token
      mockAxiosPost.mockRejectedValueOnce(new Error('Okta fail'));
      mockNoAuthPost.mockResolvedValueOnce(makeLoginResponse('token2', 'fallback-refresh'));
      await client.refreshToken();

      // Next refresh should try Okta with the fallback refresh token
      mockAxiosPost.mockResolvedValueOnce(makeOktaRefreshResponse('token3'));
      await client.refreshToken();

      expect(mockAxiosPost).toHaveBeenLastCalledWith(
        expect.stringContaining('token'),
        expect.objectContaining({
          refresh_token: 'fallback-refresh',
        }),
        expect.any(Object),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Error scenarios
  // -----------------------------------------------------------------------
  describe('error scenarios', () => {
    test('login rejects when assistedLogin returns success=false', async () => {
      mockNoAuthPost.mockResolvedValueOnce({
        data: {
          data: {
            assistedLogin: {
              success: false,
              status: 'error',
              errorMessage: 'Invalid credentials',
              data: null,
            },
          },
        },
      });

      const client = new InfinityGraphQLClient('bad', 'creds', mockLogger() as any);
      await expect(client.refreshToken()).rejects.toThrow('assistedLogin failed');
    });

    test('login rejects on GraphQL-level errors', async () => {
      mockNoAuthPost.mockResolvedValueOnce({
        data: {
          errors: [{ message: 'Internal server error' }],
        },
      });

      const client = new InfinityGraphQLClient('user', 'pass', mockLogger() as any);
      await expect(client.refreshToken()).rejects.toThrow('GraphQL errors during login');
    });

    test('network error during query propagates to caller', async () => {
      mockNoAuthPost.mockResolvedValue(makeLoginResponse());
      const client = new InfinityGraphQLClient('user', 'pass', mockLogger() as any);

      const networkError = new Error('Network Error');
      mockAuthPost.mockRejectedValueOnce(networkError);

      await expect(client.query('query { test }')).rejects.toThrow('Network Error');
    });

    test('GraphQL errors in query response are thrown', async () => {
      mockNoAuthPost.mockResolvedValue(makeLoginResponse());
      const client = new InfinityGraphQLClient('user', 'pass', mockLogger() as any);

      mockAuthPost.mockResolvedValueOnce({
        data: {
          errors: [{ message: 'Unauthorized' }, { message: 'Forbidden' }],
          data: null,
        },
      });

      await expect(client.query('query { test }')).rejects.toThrow('Unauthorized, Forbidden');
    });

    test('mutation with missing data throws', async () => {
      mockNoAuthPost.mockResolvedValue(makeLoginResponse());
      const client = new InfinityGraphQLClient('user', 'pass', mockLogger() as any);

      mockAuthPost.mockResolvedValueOnce({ data: { data: null } });

      await expect(client.mutate('mutation { test }')).rejects.toThrow('returned no data');
    });
  });

  // -----------------------------------------------------------------------
  // End-to-end lifecycle
  // -----------------------------------------------------------------------
  describe('end-to-end lifecycle', () => {
    test('login -> query -> refresh -> query uses correct tokens throughout', async () => {
      const log = mockLogger();
      mockNoAuthPost.mockResolvedValueOnce(makeLoginResponse('token-v1', 'refresh-v1'));
      const client = new InfinityGraphQLClient('user', 'pass', log as any);

      // Step 1: initial query triggers login
      mockAuthPost.mockResolvedValueOnce({ data: { data: { result: 'first' } } });
      const first = await client.query('query { first }');
      expect(first).toEqual({ result: 'first' });

      // Verify token-v1 is active
      let config: any = { headers: {} };
      capturedRequestInterceptor(config);
      expect(config.headers['Authorization']).toBe('Bearer token-v1');

      // Step 2: force a refresh via Okta
      mockAxiosPost.mockResolvedValueOnce(makeOktaRefreshResponse('token-v2'));
      await client.refreshToken();

      // Verify token-v2 is now active
      config = { headers: {} };
      capturedRequestInterceptor(config);
      expect(config.headers['Authorization']).toBe('Bearer token-v2');

      // Step 3: second query uses updated token
      mockAuthPost.mockResolvedValueOnce({ data: { data: { result: 'second' } } });
      const second = await client.query('query { second }');
      expect(second).toEqual({ result: 'second' });

      // Step 4: Okta fails, falls back to assistedLogin for new token
      mockAxiosPost.mockRejectedValueOnce(new Error('Okta down'));
      mockNoAuthPost.mockResolvedValueOnce(makeLoginResponse('token-v3', 'refresh-v3'));
      await client.refreshToken();

      config = { headers: {} };
      capturedRequestInterceptor(config);
      expect(config.headers['Authorization']).toBe('Bearer token-v3');
    });
  });
});
