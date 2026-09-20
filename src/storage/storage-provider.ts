import { ServiceKey } from '../services/service-provider.js';
import { type IStorage } from './storage.js';

// A factory seam for building a rooted IStorage for a location (an absolute folder
// locally, a container id/URL remotely). todl-runtime owns IStorage (a *rooted*
// store) but not the means to create one for a location; a host supplies this
// (Plexus's StorageService already exposes CreateStorage and adopts the key).
export interface IStorageProvider {
    CreateStorage(location: string): IStorage;
}

export const StorageProviderKey = new ServiceKey<IStorageProvider>('StorageProvider');
