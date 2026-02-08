import type {Config} from '@jest/types';
export default async (): Promise<Config.InitialOptions> => {
  return {
    verbose: true,
    preset: 'ts-jest',
    collectCoverage: false,
    coverageDirectory: 'coverage',
    coveragePathIgnorePatterns: [
      '/node_modules/',
      '/dist/',
      'src/api/interface_',
      'src/__mocks__/',
      'src/__tests__/',
    ],
  };
};
