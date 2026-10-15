import { dbConfig } from "../../eslint.config.js"

// The local-database rules (`dbConfig` in the root eslint.config.js). The build runs this lint first.
export default [
  ...dbConfig,
  {
    // An app-local Dexie store outside the app database, so the data-access rules do not apply.
    files: ["src/db/shopifySyncDb.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": "off",
      "no-restricted-syntax": "off"
    }
  }
]
