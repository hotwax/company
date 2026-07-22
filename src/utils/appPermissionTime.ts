export type AppPermissionTimestamp = number | string | null | undefined

export const toEpochMillis = (value: AppPermissionTimestamp): number | undefined => {
  if(value === null || value === undefined || value === "") {return undefined}

  if(typeof value === "number") {
    return Number.isFinite(value) ? value : undefined
  }

  const normalizedValue = value.trim()
  if(!normalizedValue) {return undefined}

  const timestamp = /^\d+$/.test(normalizedValue)
    ? Number(normalizedValue)
    : Date.parse(normalizedValue)

  return Number.isFinite(timestamp) ? timestamp : undefined
}
