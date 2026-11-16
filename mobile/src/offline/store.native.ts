import { Platform } from "react-native";
import { CloverLocalAI } from "../../modules/clover-local-ai";
import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import type { OfflineStore } from "./types";

// Serialize initialization per identity: key creation and first WAL/schema setup
// must finish before a second connection opens the same new database.
const openings = new Map<string, Promise<OfflineStore>>();
export async function openOfflineStore(
  identity: string,
): Promise<OfflineStore> {
  const previous = openings.get(identity) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(() => createOfflineStore(identity));
  openings.set(identity, next);
  try {
    return await next;
  } finally {
    if (openings.get(identity) === next) openings.delete(identity);
  }
}
async function encryptionKey(keyName: string) {
  let key = await SecureStore.getItemAsync(keyName);
  if (!key) {
    key = Array.from(await Crypto.getRandomBytesAsync(32), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    await SecureStore.setItemAsync(keyName, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  return key;
}

/** SQLCipher key is device-only and separate from the encrypted database. */
async function createOfflineStore(identity: string): Promise<OfflineStore> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    identity,
  );
  const keyName = `clover.offline.${hash}`;
  const key = await encryptionKey(keyName);
  if (!/^[a-f0-9]{64}$/.test(key))
    throw new Error("Offline encryption key is invalid.");
  const directory = SQLite.defaultDatabaseDirectory + "/clover-private";
  const db = await SQLite.openDatabaseAsync(
    `clover-${hash}.db`,
    { useNewConnection: true },
    directory,
  );
  try {
    await db.execAsync(`PRAGMA key = "x'${key}'";`);
    const cipher = await db.getFirstAsync<Record<string, unknown>>(
      "PRAGMA cipher_version;",
    );
    if (!cipher || !Object.values(cipher).some(Boolean)) {
      await db.closeAsync();
      throw new Error(
        "This build does not support encrypted offline storage. Install the latest Clover build.",
      );
    }
    await db.execAsync(
      "PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS offline_data (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);",
    );
    if (Platform.OS === "ios") {
      if (!CloverLocalAI?.protectOfflineDirectory) {
        await db.closeAsync();
        throw new Error(
          "Install the updated native build to protect offline storage.",
        );
      }
      await CloverLocalAI.protectOfflineDirectory(directory);
    }
  } catch (error) {
    await db.closeAsync().catch(() => {});
    throw error;
  }
  let closed = false;
  return {
    async get<T>(key: string) {
      const row = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM offline_data WHERE key=?",
        key,
      );
      return row ? (JSON.parse(row.value) as T) : null;
    },
    async set(key, value) {
      await db.runAsync(
        "INSERT INTO offline_data(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        key,
        JSON.stringify(value),
      );
    },
    async remove(key) {
      await db.runAsync("DELETE FROM offline_data WHERE key=?", key);
    },
    async keys(prefix) {
      return (
        await db.getAllAsync<{ key: string }>(
          "SELECT key FROM offline_data WHERE substr(key,1,?)=?",
          prefix.length,
          prefix,
        )
      ).map((r) => r.key);
    },
    async clear() {
      await db.execAsync(
        "DELETE FROM offline_data; PRAGMA wal_checkpoint(TRUNCATE); VACUUM;",
      );
    },
    async close() {
      if (!closed) {
        closed = true;
        await db.closeAsync();
      }
    },
  };
}
