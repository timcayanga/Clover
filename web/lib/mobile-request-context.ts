import { AsyncLocalStorage } from "node:async_hooks";

// Only the mobile API boundary may establish this context, after verifying a
// Clerk session JWT. It is never populated from a user ID or a client header.
const mobileRequests = new AsyncLocalStorage<{
  userId: string;
  request: Request;
}>();
export const getMobileRequestContext = () => mobileRequests.getStore();
export const withMobileRequestContext = <T>(
  userId: string,
  request: Request,
  work: () => T,
) => mobileRequests.run({ userId, request }, work);
