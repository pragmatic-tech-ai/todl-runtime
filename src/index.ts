export { Observable, type PropertyChangedEventArgs } from './observable.js';
export { Signal, type Disposable, type SignalLifecycle } from './signal.js';
export {
    Ask,
    ConfirmAsk,
    PickFolderAsk,
    PickFileAsk,
    PromptTextAsk,
    ChooseAsk,
    type FileFilter,
    type Choice,
    type IPromptService,
} from './prompt/ask.js';
export {
    type IStorage,
    type StorageEntry,
    type ILocalFileAccess,
    isLocalFileAccess,
    compareStorageEntries,
} from './storage/storage.js';
export { FakeStorage } from './storage/fake-storage.js';
// NodeFsStorage is Node-only (node:fs/promises); it lives in the `/node` subpath
// entry (see ./node.ts), NOT this universal barrel — importing it here would pull
// node:fs into browser bundles (Vite externalizes it to a stub, breaking the build).
export {
    ObservableCollection,
    type CollectionChange,
    type CollectionChangeListener,
    type IReadOnlyObservableCollection,
} from './collections/observable-collection.js';
export { copyTree } from './storage/copy-tree.js';
export { OperatingSystem, EnvironmentKey, type IEnvironment } from './environment.js';
export { StorageProviderKey, type IStorageProvider } from './storage/storage-provider.js';
export { SessionStore, SessionStoreKey, type ISessionStore } from './session/session-store.js';
export {
    MapPropertyBag,
    type IPropertyBag,
    type IReadOnlyPropertyAccessor,
    type IPropertyAccessor,
    type PropertyAccessor,
} from './property-bag.js';
export {
    ServiceProvider,
    ServiceKey,
    ServiceLifetime,
    type IServiceProvider,
    type IServiceContainer,
    type ServiceConstructor,
    type ServiceToken,
    type ServiceFactory,
} from './services/service-provider.js';
export { ServiceBase } from './services/service-base.js';
export { HostKind } from './composition/host-kind.js';
export { Module, type IModule } from './composition/module.js';
export { CompositionRoot } from './composition/composition-root.js';
