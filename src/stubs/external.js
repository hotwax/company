// Stubs for packages used by @common/accxui but not needed by the company app.
const noop = () => {};
const stub = {};

// firebase/app + firebase/messaging
export const initializeApp = noop;
export const getMessaging = noop;
export const getToken = noop;
export const onMessage = noop;
export const isSupported = () => Promise.resolve(false);

// comlink
export const wrap = noop;
export const expose = noop;
export const releaseProxy = Symbol('releaseProxy');
export const transfer = noop;
export const Group = noop;

// @shopify/app-bridge/actions
export const Features = stub;
export const Redirect = stub;
export const Scanner = stub;
export const AppLink = stub;
export const useAppBridge = noop;

// @module-federation/runtime
export const loadRemote = noop;
export const init = noop;
export const registerRemotes = noop;

// child_process (Node built-in, stubbed for browser)
export const execSync = noop;
export const exec = noop;
export const spawn = noop;

// encoding-japanese
export const convert = noop;
export const stringToCode = noop;
export const codeToString = noop;

export default stub;
