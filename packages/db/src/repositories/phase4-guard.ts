import type { ClientSession, Types } from "mongoose";

import { getInternalDatabaseConnection } from "../connection";
import { ScheduleGuardModel } from "../models/phase4-models";
import { isDuplicateKey, isWriteConflict } from "../commands/errors";

export interface ScheduleGuardIdentity {
  readonly scopeType: "location" | "staff";
  readonly scopeId: Types.ObjectId;
}

interface ObservedGuard extends ScheduleGuardIdentity {
  readonly version: number;
  readonly exists: boolean;
}

export async function guardedConfigurationMutation<T>(
  tenantId: Types.ObjectId,
  identities: readonly ScheduleGuardIdentity[],
  work: (session: ClientSession) => Promise<T>
): Promise<T> {
  const deduped = new Map<string, ScheduleGuardIdentity>();
  for (const identity of identities) {
    deduped.set(`${identity.scopeType}:${identity.scopeId.toHexString()}`, identity);
  }
  const ordered = [...deduped.values()].sort((left, right) =>
    `${left.scopeType}:${left.scopeId.toHexString()}`.localeCompare(
      `${right.scopeType}:${right.scopeId.toHexString()}`
    )
  );
  const rows = await ScheduleGuardModel.find({
    tenantId,
    $or: ordered.map(({ scopeType, scopeId }) => ({ scopeType, scopeId }))
  });
  const versions = new Map(
    rows.map((row) => [`${row.scopeType}:${row.scopeId.toHexString()}`, row.version])
  );
  const observed: ObservedGuard[] = ordered.map((identity) => {
    const version = versions.get(`${identity.scopeType}:${identity.scopeId.toHexString()}`);
    return { ...identity, version: version ?? 0, exists: version !== undefined };
  });

  try {
    return await getInternalDatabaseConnection().transaction(async (session) => {
      for (const guard of observed) {
        if (guard.exists) {
          const updated = await ScheduleGuardModel.findOneAndUpdate(
            {
              tenantId,
              scopeType: guard.scopeType,
              scopeId: guard.scopeId,
              version: guard.version
            },
            { $inc: { version: 1 } },
            { new: true, runValidators: true, session }
          );
          if (updated === null) throw new Error("Schedule/configuration guard conflict");
        } else {
          await ScheduleGuardModel.create(
            [
              {
                schemaVersion: 1,
                tenantId,
                scopeType: guard.scopeType,
                scopeId: guard.scopeId,
                version: 1
              }
            ],
            { session }
          );
        }
      }
      return work(session);
    });
  } catch (error) {
    if (isDuplicateKey(error) || isWriteConflict(error)) {
      throw new Error("Schedule/configuration guard conflict", { cause: error });
    }
    throw error;
  }
}
