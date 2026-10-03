/** Canonical, versioned and storage-injectable FloatingPanel geometry persistence. */
export type PanelGeometry = { x: number; y: number; width: number; height: number };
export type PartialPanelGeometry = Partial<PanelGeometry>;

export interface GeometryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const GEOMETRY_VERSION = 4;
export const GEOMETRY_KEY_PREFIX = "jz-panel-geom-v4-";
export const LEGACY_GEOMETRY_KEY_PREFIX = "jz-panel-geom-";
export const LEGACY_POSITION_KEY_PREFIX = "jz-panel-pos-";
export const STALE_GEOMETRY_KEY_PREFIXES = [
  "jz-panel-geom-v3-",
  "jz-panel-geom-v2-",
  "jz-panel-geom-v1-",
] as const;

type StoredGeometryEnvelope = {
  version: typeof GEOMETRY_VERSION;
  geometry: PanelGeometry;
};

export function normalizePanelId(panelId: string): string | null {
  const id = typeof panelId === "string" ? panelId.trim() : "";
  return id.length > 0 ? id : null;
}

export function storageKey(panelId: string): string {
  return GEOMETRY_KEY_PREFIX + panelId;
}

function browserStorage(): GeometryStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function legacyKeys(panelId: string): [string, string] {
  return [LEGACY_GEOMETRY_KEY_PREFIX + panelId, LEGACY_POSITION_KEY_PREFIX + panelId];
}

function parseStored(value: string | null): unknown {
  if (value === null) return undefined;
  try { return JSON.parse(value) as unknown; } catch { return undefined; }
}

function safeGet(storage: GeometryStorage, key: string): string | null {
  try { return storage.getItem(key); } catch { return null; }
}

function safeRemove(storage: GeometryStorage, key: string): void {
  try { storage.removeItem(key); } catch { /* persistence is best effort */ }
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function sanitizeGeometry(raw: unknown): PartialPanelGeometry | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const result: PartialPanelGeometry = {};
  if (finite(record.x)) result.x = record.x;
  if (finite(record.y)) result.y = record.y;
  if (finite(record.width) && record.width > 0) result.width = record.width;
  if (finite(record.height) && record.height > 0) result.height = record.height;
  return Object.keys(result).length === 0 ? null : result;
}

export type ReadGeometryResult = {
  geometry: PartialPanelGeometry;
  migratedFromPositionOnly: boolean;
  discardedStaleGeometry: boolean;
};

function readCurrentGeometry(raw: unknown): PanelGeometry | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const envelope = raw as Partial<StoredGeometryEnvelope>;
  if (envelope.version !== GEOMETRY_VERSION) return null;
  const geometry = sanitizeGeometry(envelope.geometry);
  if (!geometry || geometry.x === undefined || geometry.y === undefined || geometry.width === undefined || geometry.height === undefined) return null;
  return geometry as PanelGeometry;
}

/** Remove generations whose dimensions may predate the current panel layout. */
export function discardStalePanelGeometry(panelId: string, storage: GeometryStorage | null = browserStorage()): boolean {
  const id = normalizePanelId(panelId);
  if (!id || !storage) return false;
  let found = false;
  for (const prefix of [...STALE_GEOMETRY_KEY_PREFIXES, LEGACY_GEOMETRY_KEY_PREFIX]) {
    const key = prefix + id;
    if (safeGet(storage, key) !== null) found = true;
    safeRemove(storage, key);
  }
  return found;
}

export function readPanelGeometry(
  panelId: string,
  storage: GeometryStorage | null = browserStorage(),
): ReadGeometryResult | null {
  const id = normalizePanelId(panelId);
  if (!id || !storage) return null;
  const currentKey = storageKey(id);
  const current = readCurrentGeometry(parseStored(safeGet(storage, currentKey)));
  if (!current && safeGet(storage, currentKey) !== null) safeRemove(storage, currentKey);
  const discardedStaleGeometry = discardStalePanelGeometry(id, storage);
  if (current) return { geometry: current, migratedFromPositionOnly: false, discardedStaleGeometry };
  const legacy = sanitizeGeometry(parseStored(safeGet(storage, LEGACY_POSITION_KEY_PREFIX + id)));
  if (legacy && (legacy.x !== undefined || legacy.y !== undefined)) {
    return { geometry: { x: legacy.x, y: legacy.y }, migratedFromPositionOnly: true, discardedStaleGeometry };
  }
  return null;
}

export function writePanelGeometry(
  panelId: string,
  geometry: PanelGeometry,
  storage: GeometryStorage | null = browserStorage(),
): boolean {
  const id = normalizePanelId(panelId);
  if (!id || !storage) return false;
  const clean = sanitizeGeometry(geometry);
  const complete = clean !== null && clean.x !== undefined && clean.y !== undefined && clean.width !== undefined && clean.height !== undefined;
  if (!complete) {
    safeRemove(storage, storageKey(id));
    return false;
  }
  try {
    const envelope: StoredGeometryEnvelope = { version: GEOMETRY_VERSION, geometry: clean as PanelGeometry };
    storage.setItem(storageKey(id), JSON.stringify(envelope));
    discardStalePanelGeometry(id, storage);
    safeRemove(storage, LEGACY_POSITION_KEY_PREFIX + id);
    return true;
  } catch {
    return false;
  }
}

export function resetPanelGeometry(
  panelId: string,
  storage: GeometryStorage | null = browserStorage(),
): void {
  const id = normalizePanelId(panelId);
  if (!id || !storage) return;
  safeRemove(storage, storageKey(id));
  discardStalePanelGeometry(id, storage);
  const [, legacyPosition] = legacyKeys(id);
  safeRemove(storage, legacyPosition);
}
