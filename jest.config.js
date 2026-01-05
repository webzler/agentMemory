module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

    // Transform TypeScript files
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            tsconfig: {
                esModuleInterop: true,
                allowSyntheticDefaultImports: true
            }
        }]
    },

    // Don't transform node_modules except specific packages
    transformIgnorePatterns: [
        'node_modules/(?!(uuid|chokidar))'
    ],

    // Mock problematic ESM packages
    moduleNameMapper: {
        '^uuid$': '<rootDir>/tests/__mocks__/uuid.ts',
        '^chokidar$': '<rootDir>/tests/__mocks__/chokidar.ts'
    },

    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/index.ts',
        '!src/**/*.test.ts'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    coverageThreshold: {
        global: {
            branches: 60,
            functions: 60,
            lines: 60,
            statements: 60
        }
    },
    verbose: true,
    testTimeout: 10000
};
