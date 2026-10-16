module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

    // Transform TypeScript files (same compiler settings as tsconfig.json)
    transform: {
        '^.+\\.ts$': ['ts-jest', {
            tsconfig: {
                module: 'commonjs',
                target: 'ES2020',
                lib: ['ES2020'],
                strict: true,
                esModuleInterop: true,
                allowSyntheticDefaultImports: true,
                skipLibCheck: true,
                resolveJsonModule: true,
                moduleResolution: 'node'
            }
        }]
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
