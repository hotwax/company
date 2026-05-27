module.exports = {
  preset: "@vue/cli-plugin-unit-jest/presets/typescript-and-babel",
  setupFilesAfterEnv: ["<rootDir>/tests/unit/jest.setup.js"],
  testMatch: ["**/tests/unit/**/*.test.[jt]s?(x)", "**/tests/unit/**/*.spec.[jt]s?(x)"],
  globals: {
    "ts-jest": {
      diagnostics: false,
      isolatedModules: true
    }
  }
};
