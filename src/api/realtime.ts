import { io, type Socket } from 'socket.io-client';
import { apiRequest } from './client';
import { getApiChannel, subscribeApiChannel } from './api-channel';
import { readHttpProxyConfig } from './http-proxy-config';
import { reserveChannelsEnabled } from './reserve-config';

// Socket.IO's public event interface uses variadic callbacks for different
// events. Keep that interface so existing ride handlers also receive MAX events.
type Listener = (...args: any[]) => void;
export interface AppSocket {
  readonly connected: boolean;
  on(event: string, listener: Listener): AppSocket;
  off(event: string, listener: Listener): AppSocket;
  disconnect(): void;
}
type EventPage = { cursor: string; reset: boolean; events: { event: string; payload: unknown }[] };
const sessions = new Map<string, RealtimeSession>();

class RealtimeSession {
  readonly clients = new Set<RelaySocket>();
  socket: Socket;
  private socketTarget = '';
  private cursor?: string;
  private fallbackConnected = false;
  private timer?: ReturnType<typeof setTimeout>;
  private request?: AbortController;
  private closed = false;
  private nextPollAt = 0;
  private failures = 0;
  private unsubscribe: () => void;
  constructor(private readonly url: string, private readonly token: string, private readonly key: string,private readonly fallback:boolean) {
    this.socket = this.openSocket();
    this.unsubscribe = subscribeApiChannel(() => {
      const target = this.target();
      if (this.socketTarget !== `${target.url}${target.path}`) {
        const previous = this.socket;
        this.request?.abort();
        this.socket = this.openSocket();
        previous.disconnect();
        if (!this.fallbackConnected) this.emit('disconnect');
      }
      if (!this.socket.connected) this.schedule(0);
    });
    this.schedule(1000);
  }
  private target() {
    const proxy = getApiChannel() === 'proxy' ? readHttpProxyConfig() : null;
    return proxy ? { url: proxy.socketUrl, path: proxy.socketPath } : { url: this.url, path: '/socket.io' };
  }
  private openSocket(): Socket {
    const target = this.target();
    this.socketTarget = `${target.url}${target.path}`;
    const socket = io(target.url, { path: target.path, auth: { token: this.token }, transports: ['websocket', 'polling'], reconnectionDelay: this.fallback ? 15_000 : 1000, reconnectionDelayMax: this.fallback ? 60_000 : 8000 });
    socket.on('connect', () => {
      if (this.closed || socket !== this.socket) return;
      this.request?.abort(); clearTimeout(this.timer); this.fallbackConnected = false; this.failures=0; this.nextPollAt=0;
      this.emit('connect');
    });
    socket.on('disconnect', () => { if (this.closed || socket !== this.socket) return; if (!this.fallbackConnected) this.emit('disconnect'); this.schedule(0); });
    socket.on('connect_error', error => {if (this.closed || socket !== this.socket) return; this.emit('connect_error',error);this.schedule(0);});
    socket.onAny((event, ...args) => {if (!this.closed && socket === this.socket) this.emit(event, ...args);});
    return socket;
  }
  get connected(): boolean { return this.socket.connected || this.fallbackConnected; }
  private emit(event: string, ...args: unknown[]) { for (const client of this.clients) client.emit(event, ...args); }
  private schedule(delay: number) {
    if (!this.fallback || this.closed || this.socket.connected || this.request) return;
    clearTimeout(this.timer); this.timer = setTimeout(() => void this.poll(), Math.max(delay,this.nextPollAt-Date.now()));
  }
  private async poll() {
    if (this.closed || this.socket.connected || this.request) return;
    const controller = new AbortController(); this.request = controller;
    try {
      const page = await apiRequest<EventPage>(`/v1/realtime/events${this.cursor ? `?after=${encodeURIComponent(this.cursor)}` : ''}`, {
        token: this.token, cache: 'no-store', signal: controller.signal,
      });
      if (this.closed || controller.signal.aborted || this.socket.connected) return;
      this.cursor = page.cursor;
      this.failures=0;
      const first = !this.fallbackConnected; this.fallbackConnected = true;
      if (first || page.reset) this.emit('connect');
      for (const { event, payload } of page.events) this.emit(event, payload);
    } catch {
      if (!controller.signal.aborted) this.failures++;
      if (this.fallbackConnected && !controller.signal.aborted) { this.fallbackConnected = false; this.emit('disconnect'); }
    } finally {
      if (this.request === controller) this.request = undefined;
      this.nextPollAt = Date.now() + Math.min(60_000,6000 * 2 ** Math.min(4,this.failures));
      this.schedule(6000);
    }
  }
  release(client: RelaySocket) {
    if (this.closed || !this.clients.delete(client)) return;
    if (this.clients.size) return;
    this.closed = true; clearTimeout(this.timer); this.request?.abort(); this.unsubscribe(); this.socket.disconnect(); sessions.delete(this.key);
  }
}
class RelaySocket implements AppSocket {
  private readonly listeners = new Map<string, Set<Listener>>();
  constructor(private readonly session: RealtimeSession) { session.clients.add(this); }
  get connected() { return this.session.connected; }
  on(event: string, listener: Listener): AppSocket {
    const set = this.listeners.get(event) ?? new Set<Listener>(); set.add(listener); this.listeners.set(event, set);
    if (event === 'connect' && this.session.connected) queueMicrotask(() => {
      if (this.listeners.get(event)?.has(listener) && this.session.connected) listener();
    });
    return this;
  }
  off(event: string, listener: Listener): AppSocket { this.listeners.get(event)?.delete(listener); return this; }
  emit(event: string, ...args: unknown[]) { for (const listener of this.listeners.get(event) ?? []) listener(...args); }
  disconnect() { this.listeners.clear(); this.session.release(this); }
}
export function createAppSocket(url: string, token: string): AppSocket {
  const proxy = readHttpProxyConfig();
  const fallback=reserveChannelsEnabled() || !!proxy;
  const key = `${url}\n${token}\n${fallback}\n${proxy?.apiUrl ?? ''}`;
  let session = sessions.get(key);
  if (!session) { session = new RealtimeSession(url, token, key,fallback); sessions.set(key, session); }
  return new RelaySocket(session);
}
