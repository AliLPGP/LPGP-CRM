"use server";

import { getSessionUser } from "./auth";
import {
  checkPipelineConflicts as check,
  listKnownEvents as list,
  type ConflictQuery,
  type KnownEvent,
} from "./pipeline-conflicts";
import type { PipelineConflicts } from "./types";

// No type re-export here: Turbopack registers every export of a "use server"
// module as an action, and a re-exported type became a ReferenceError at
// module evaluation. Consumers import the type from pipeline-conflicts.

/** Heads-up for a company someone is about to add. Null when signed out. */
export async function checkPipelineConflicts(
  query: ConflictQuery,
): Promise<PipelineConflicts | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return check(query);
}

/** Events a lead can be pursued for, for the picker. */
export async function listKnownEvents(): Promise<KnownEvent[]> {
  const user = await getSessionUser();
  if (!user) return [];
  return list();
}
