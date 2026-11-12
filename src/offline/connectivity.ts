import { useSyncExternalStore } from 'react';
let reachable = true;
let physicalOnline = true;
const listeners = new Set<()=>void>();
export function setServerReachable(value:boolean) {
  if (reachable === value) return;
  reachable=value; for (const listener of listeners) listener();
}
export function setPhysicalConnectivity(value:boolean) { physicalOnline=value; if (!value) setServerReachable(false); }
export function hasPhysicalConnectivity() { return physicalOnline; }
export function isServerReachable() { return reachable; }
export function useServerReachable() { return useSyncExternalStore(listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},isServerReachable,()=>true); }
