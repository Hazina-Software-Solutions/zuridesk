import mongoose from "mongoose";

export interface DatabaseConnectionOptions {
  uri: string;
  databaseName: string;
  maxPoolSize?: number;
  serverSelectionTimeoutMs?: number;
}

export type DatabaseHealth = "up" | "down";

let connectionPromise: Promise<void> | undefined;

export async function connectDatabase(options: DatabaseConnectionOptions): Promise<void> {
  if (mongoose.connection.readyState === mongoose.ConnectionStates.connected) {
    return;
  }

  connectionPromise ??= mongoose
    .connect(options.uri, {
      autoIndex: false,
      dbName: options.databaseName,
      maxPoolSize: options.maxPoolSize ?? 10,
      serverSelectionTimeoutMS: options.serverSelectionTimeoutMs ?? 5_000
    })
    .then(() => undefined)
    .catch((error: unknown) => {
      connectionPromise = undefined;
      throw error;
    });

  return connectionPromise;
}

export function getInternalDatabaseConnection(): mongoose.Connection {
  return mongoose.connection;
}

export function getInternalDatabase(): NonNullable<mongoose.Connection["db"]> {
  const database = mongoose.connection.db;
  if (database === undefined) {
    throw new Error("MongoDB connection has no selected database");
  }
  return database;
}

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const database = mongoose.connection.db;

  if (
    mongoose.connection.readyState !== mongoose.ConnectionStates.connected ||
    database === undefined
  ) {
    return "down";
  }

  try {
    await database.admin().ping();
    return "up";
  } catch {
    return "down";
  }
}

export async function disconnectDatabase(): Promise<void> {
  connectionPromise = undefined;

  if (mongoose.connection.readyState !== mongoose.ConnectionStates.disconnected) {
    await mongoose.disconnect();
  }
}
