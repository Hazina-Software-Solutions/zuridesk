import createClient from "openapi-fetch";

import type { paths } from "./generated/schema";

export function createZuriDeskApiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl });
}

export function createZuriDeskWebApiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl, credentials: "include" });
}

export type { paths as ZuriDeskApiPaths } from "./generated/schema";
