/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': '@swc/jest',
  },
  transformIgnorePatterns: [],
  collectCoverageFrom: ['src/**/*.(t|j)s', 'libs/**/*.(t|j)s', 'apps/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};
