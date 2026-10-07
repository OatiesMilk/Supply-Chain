export interface StagedFile {
  id: string; // unique string id
  recordId: string;
  file: File;
  stagedAt: number;
}

const DB_NAME = 'PodStagingDB';
const STORE_NAME = 'staged_files';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('recordId', 'recordId', { unique: false });
      }
    };
  });
}

export async function saveStagedFile(staged: StagedFile): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(staged);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeStagedFile(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getStagedFiles(recordId: string): Promise<StagedFile[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('recordId');
    const request = index.getAll(IDBKeyRange.only(recordId));
    request.onsuccess = () => {
      resolve((request.result || []).sort((a, b) => b.stagedAt - a.stagedAt));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function clearStagedFiles(recordId: string): Promise<void> {
  const files = await getStagedFiles(recordId);
  for (const f of files) {
    await removeStagedFile(f.id);
  }
}
