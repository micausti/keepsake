/**
 * Browsers may evict site data under storage pressure (Safari also clears
 * data for sites not visited in a while). Asking for persistent storage
 * protects the inventory; installed home-screen apps are usually granted it.
 */

export interface StorageStatus {
  supported: boolean;
  persisted: boolean;
  usageBytes?: number;
  quotaBytes?: number;
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (!storage?.persisted) return { supported: false, persisted: false };
  const [persisted, estimate] = await Promise.all([
    storage.persisted(),
    storage.estimate ? storage.estimate() : Promise.resolve(undefined),
  ]);
  return {
    supported: true,
    persisted,
    usageBytes: estimate?.usage,
    quotaBytes: estimate?.quota,
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return 'unknown';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
