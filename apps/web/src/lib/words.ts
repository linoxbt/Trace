// The words a job uses for its two sides: a cleaning job has a client and a
// cleaner, a car job a car owner and a mechanic. Inside the code the sides stay
// "homeowner" (pays) and "tradesperson" (does the work).

import { capitalise, categoryOf } from "@trace/core/categories";

export interface Words {
  client: string;
  pro: string;
  Client: string;
  Pro: string;
  /** "the homeowner's", "the cleaner's" */
  clientPos: string;
  proPos: string;
}

export function wordsFor(category: string | null | undefined): Words {
  const c = categoryOf(category);
  return { client: c.client, pro: c.pro, Client: capitalise(c.client), Pro: capitalise(c.pro), clientPos: `${c.client}'s`, proPos: `${c.pro}'s` };
}
