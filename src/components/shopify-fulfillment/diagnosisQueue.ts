// Bound concurrent Shopify reads across all mounted cards. Results stay instance-scoped.
let active = 0;
const waiting: Array<() => void> = [];
export async function scheduleDiagnosis<T>(request: () => Promise<T>): Promise<T> {
  if(active >= 3) {await new Promise<void>(resolve => waiting.push(resolve));}
  active++;
  try {return await request();}
  finally {active--; waiting.shift()?.();}
}
