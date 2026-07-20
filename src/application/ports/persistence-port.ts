export interface SavedLocalScript {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly sourceText: string;
  readonly locale: string;
  readonly savedAtIso: string;
}

export interface PersistencePort {
  save(script: Omit<SavedLocalScript, "id" | "revision" | "savedAtIso"> & { readonly id?: string }): Promise<SavedLocalScript>;
  list(): Promise<readonly SavedLocalScript[]>;
  delete(id: string): Promise<void>;
  deleteAll(): Promise<void>;
}
