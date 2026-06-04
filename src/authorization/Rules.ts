// Maps app-action permissions to the server permission rule that grants them.
// Key   = app-action permission name checked via hasPermission() in the UI
// Value = boolean rule of server permission IDs (supports ' AND ' / ' OR ');
//         an empty value grants the app-action permission to every user.
export default {
  "COMPANY_APP_VIEW": "COMPANY_APP_VIEW",
  "APP_COMMERCE_VIEW": "COMMERCEUSER_VIEW",
  "APP_PWA_STANDALONE_ACCESS": "COMMON_ADMIN"
} as Record<string, string>
