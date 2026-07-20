import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PersistencePort, SavedLocalScript } from "../../application/ports/persistence-port";

interface OrthoVerbaDatabase extends DBSchema {
  savedScripts: {
    readonly key: string;
    readonly value: SavedLocalScript;
    readonly indexes: { readonly "by-saved-at": string };
  };
}

export class IndexedDbScriptRepository implements PersistencePort {
  #database: Promise<IDBPDatabase<OrthoVerbaDatabase>> | null = null;

  #open(): Promise<IDBPDatabase<OrthoVerbaDatabase>> {
    this.#database ??= openDB<OrthoVerbaDatabase>("orthoverba-local", 1, {
      upgrade(database) {
        const store = database.createObjectStore("savedScripts", { keyPath: "id" });
        store.createIndex("by-saved-at", "savedAtIso");
      },
    });
    return this.#database;
  }

  async save(
    input: Omit<SavedLocalScript, "id" | "revision" | "savedAtIso"> & { readonly id?: string },
  ): Promise<SavedLocalScript> {
    const database = await this.#open();
    const id = input.id ?? crypto.randomUUID();
    const existing = await database.get("savedScripts", id);
    const record: SavedLocalScript = {
      id,
      name: input.name.slice(0, 160),
      revision: (existing?.revision ?? 0) + 1,
      sourceText: input.sourceText.slice(0, 2_000_000),
      locale: input.locale.slice(0, 64),
      savedAtIso: new Date().toISOString(),
    };
    await database.put("savedScripts", record);
    return record;
  }

  async list(): Promise<readonly SavedLocalScript[]> {
    const database = await this.#open();
    const records = await database.getAllFromIndex("savedScripts", "by-saved-at");
    return records.sort((left, right) => right.savedAtIso.localeCompare(left.savedAtIso));
  }

  async delete(id: string): Promise<void> {
    const database = await this.#open();
    await database.delete("savedScripts", id);
  }

  async deleteAll(): Promise<void> {
    const database = await this.#open();
    await database.clear("savedScripts");
  }
}
