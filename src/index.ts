export { Observable, type PropertyChangeCallback } from './observable.js'
export {
    type IStorage,
    type StorageEntry,
    type ILocalFileAccess,
    isLocalFileAccess,
    compareStorageEntries,
} from './storage/storage.js'
export { FakeStorage } from './storage/fake-storage.js'
