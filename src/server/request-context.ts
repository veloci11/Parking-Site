import { AsyncLocalStorage } from "node:async_hooks";
const requests = new AsyncLocalStorage<{ id: string }>();
export function withRequestContext<T>(id: string, operation: () => T): T {
  return requests.run({ id }, operation);
}
export function currentRequestId() {
  return requests.getStore()?.id;
}
export function diagnosticBackendHeaders(): Record<string, string> {
  const id = currentRequestId();
  return id ? { "x-gp-request-id": id } : {};
}
