import { OAuth2Headers } from './oauth2';
import { InternalAxiosRequestConfig } from 'axios';

describe('OAuth2Headers.intercept', () => {
  test('injects Bearer token into Authorization header', () => {
    const config = { headers: {} } as InternalAxiosRequestConfig;
    const result = OAuth2Headers.intercept(config, 'test-access-token');
    expect(result.headers['Authorization']).toBe('Bearer test-access-token');
  });

  test('creates headers object if missing', () => {
    const config = {} as InternalAxiosRequestConfig;
    const result = OAuth2Headers.intercept(config, 'my-token');
    expect(result.headers['Authorization']).toBe('Bearer my-token');
  });

  test('uses custom token_type when provided', () => {
    const config = { headers: {} } as InternalAxiosRequestConfig;
    const result = OAuth2Headers.intercept(config, 'my-token', 'CustomType');
    expect(result.headers['Authorization']).toBe('CustomType my-token');
  });

  test('preserves existing headers', () => {
    const config = {
      headers: { 'Content-Type': 'application/json' },
    } as unknown as InternalAxiosRequestConfig;
    const result = OAuth2Headers.intercept(config, 'my-token');
    expect(result.headers['Content-Type']).toBe('application/json');
    expect(result.headers['Authorization']).toBe('Bearer my-token');
  });

  test('returns the modified config object', () => {
    const config = { headers: {} } as InternalAxiosRequestConfig;
    const result = OAuth2Headers.intercept(config, 'token');
    expect(result).toBe(config);
  });
});
