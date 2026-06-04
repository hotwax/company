import Rules from './Rules'

// Evaluates a permission rule string (a single server permission id, or a
// boolean expression of them using ' AND ' / ' OR ') against the set of
// server permissions the user actually has.
const evaluateRule = (rule: string, serverPermissions: Set<string>): boolean => {
  const expr = rule.trim()
  if (!expr) return true
  if (expr.includes(' OR ')) {
    return expr.split(' OR ').some(part => evaluateRule(part, serverPermissions))
  }
  if (expr.includes(' AND ')) {
    return expr.split(' AND ').every(part => evaluateRule(part, serverPermissions))
  }
  return serverPermissions.has(expr)
}

/**
 * Prepares the list of app-action permissions from the raw server permissions.
 * Each rule in Rules maps an app-action permission to the server permission(s)
 * required to grant it, so the UI can check stable app-action names via
 * hasPermission() regardless of the underlying server permission ids.
 */
export const prepareAppPermissions = (serverPermissions: string[]): string[] => {
  const serverSet = new Set(serverPermissions)
  return Object.keys(Rules).filter(appPermission => evaluateRule(Rules[appPermission], serverSet))
}
