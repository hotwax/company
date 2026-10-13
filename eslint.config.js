import accxuiConfig from "../../eslint.config.js"

export default [
  ...accxuiConfig,
  {
    // An app-local Dexie store outside the app database, so the data-access rules do not apply.
    files: ["src/utils/storage.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": "off",
      "no-restricted-syntax": "off"
    }
  }
]
