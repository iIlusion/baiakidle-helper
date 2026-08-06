import { createSocketRole, observeSocket, type SocketRole } from "./socket-role";
import { shouldDropVisualForGame } from "./ws-filter";

declare const unsafeWindow: Window & typeof globalThis;

const page = unsafeWindow;
const monitored = /^wss?:\/\/(?:rt\d+\.)?baiakidle\.com(?:\/|$)/i;
const sockets = new Map<string, WebSocket>();
const roles = new Map<WebSocket, SocketRole>();
const seen = new WeakSet<WebSocket>();
const filteredSockets = new WeakSet<WebSocket>();
const packetListeners = new Set<(bytes: Uint8Array, receivedAt: number) => void>();
const outgoingListeners = new Set<(bytes: Uint8Array, url: string) => void>();

/** When true, game/Pixi never sees `fx` room packets (particles, floating damage art). */
let reduceVfx = false;

export function setReduceVfx(enabled: boolean): void {
  reduceVfx = enabled;
  console.info(`[BaiakIdle Helper] reduceVfx=${enabled} (fx packets ${enabled ? "blocked from game" : "pass through"})`);
}

export function getReduceVfx(): boolean {
  return reduceVfx;
}

type SocketData = string | Blob | ArrayBufferLike | ArrayBufferView;
type EarlyRecord = {
  url: string;
  socket: WebSocket;
  messages: SocketData[];
  dispatch: ((data: SocketData) => void) | null;
};
type EarlyHook = {
  native: typeof WebSocket;
  subscribe: (subscriber: (record: EarlyRecord) => void) => void;
};

const earlyHook = (page as typeof page & {
  __BAIAKIDLE_HELPER_EARLY_WS__?: EarlyHook;
}).__BAIAKIDLE_HELPER_EARLY_WS__;

function bytesSync(data: SocketData): Uint8Array | null {
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  // Blob is rare for Colyseus binary frames — avoid async on hot path.
  return null;
}

async function bytesAsync(data: SocketData): Promise<Uint8Array> {
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  return bytesSync(data) ?? new Uint8Array();
}

function dispatchPacket(socket: WebSocket, value: Uint8Array, receivedAt: number): void {
  const role = roles.get(socket);
  if (role) observeSocket(role, value);
  if (packetListeners.size === 0) return;
  for (const listener of packetListeners) listener(value, receivedAt);
}

function receive(socket: WebSocket, data: SocketData): void {
  const receivedAt = Date.now();
  const sync = bytesSync(data);
  if (sync) {
    dispatchPacket(socket, sync, receivedAt);
    return;
  }
  void bytesAsync(data).then(value => dispatchPacket(socket, value, receivedAt));
}

/**
 * Intercept game message listeners so we can drop visual flood before Pixi.
 * Helper receive uses the native addEventListener (full stream for rates/probes).
 */
function installGameMessageFilter(socket: WebSocket, helperNeedsListener: boolean): void {
  if (filteredSockets.has(socket)) return;
  filteredSockets.add(socket);

  const originalAdd = socket.addEventListener.bind(socket);
  const originalRemove = socket.removeEventListener.bind(socket);
  const wrapMap = new WeakMap<EventListenerOrEventListenerObject, EventListener>();

  if (helperNeedsListener) {
    originalAdd("message", event => {
      receive(socket, (event as MessageEvent).data as SocketData);
    });
  }

  socket.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) => {
    if (type === "message" && typeof listener === "function") {
      const wrapped: EventListener = event => {
        if (reduceVfx) {
          const data = (event as MessageEvent).data as SocketData;
          const sync = bytesSync(data);
          if (sync && shouldDropVisualForGame(sync)) return;
        }
        (listener as EventListener).call(socket, event);
      };
      wrapMap.set(listener, wrapped);
      return originalAdd(type, wrapped, options);
    }
    return originalAdd(type, listener, options);
  }) as typeof socket.addEventListener;

  socket.removeEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ) => {
    const wrapped = wrapMap.get(listener);
    return originalRemove(type, wrapped ?? listener, options);
  }) as typeof socket.removeEventListener;

  let userOnMessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;
  Object.defineProperty(socket, "onmessage", {
    configurable: true,
    enumerable: true,
    get() {
      return userOnMessage;
    },
    set(fn: ((this: WebSocket, ev: MessageEvent) => unknown) | null) {
      userOnMessage = fn;
      if (!fn) return;
      originalAdd("message", event => {
        if (reduceVfx) {
          const data = (event as MessageEvent).data as SocketData;
          const sync = bytesSync(data);
          if (sync && shouldDropVisualForGame(sync)) return;
        }
        fn.call(socket, event as MessageEvent);
      });
    }
  });

  originalAdd("close", () => {
    sockets.delete(String(socket.url));
    roles.delete(socket);
  });
}

function monitor(url: string, socket: WebSocket, early?: EarlyRecord): void {
  if (!monitored.test(url) || seen.has(socket)) return;
  seen.add(socket);
  sockets.set(url, socket);
  roles.set(socket, createSocketRole());
  // Early hook already feeds receive via dispatch — avoid double helper listener.
  installGameMessageFilter(socket, !early);

  if (early) {
    early.dispatch = data => receive(socket, data);
    for (const data of early.messages.splice(0)) receive(socket, data);
  }
}

if (earlyHook) earlyHook.subscribe(record => monitor(record.url, record.socket, record));

const CurrentWebSocket = page.WebSocket;
function HelperWebSocket(url: string | URL, protocols?: string | string[]): WebSocket {
  const socket = protocols === undefined
    ? new CurrentWebSocket(url)
    : new CurrentWebSocket(url, protocols);
  monitor(String(url), socket);
  return socket;
}
HelperWebSocket.prototype = CurrentWebSocket.prototype;
Object.setPrototypeOf(HelperWebSocket, CurrentWebSocket);
page.WebSocket = HelperWebSocket as unknown as typeof WebSocket;

const NativeWebSocket = earlyHook?.native ?? CurrentWebSocket;
const nativeSend = NativeWebSocket.prototype.send;
NativeWebSocket.prototype.send = function (data: SocketData): void {
  const url = String(this.url);
  if (monitored.test(url) && !seen.has(this)) monitor(url, this);
  if (monitored.test(url) && outgoingListeners.size > 0) {
    const sync = bytesSync(data);
    if (sync) {
      for (const listener of outgoingListeners) listener(sync, url);
    } else {
      void bytesAsync(data).then(value => {
        for (const listener of outgoingListeners) listener(value, url);
      });
    }
  }
  nativeSend.call(this, data);
};

/**
 * Colyseus gameplay *room* socket (hunt, city, treino, boss) — not chat.
 * Prefer highest-scored room; if no signals yet, fall back to any open
 * non-chat monitored socket so city stage/mode can still be sent.
 */
function gameplaySocket(): WebSocket | undefined {
  const open = [...sockets.entries()]
    .filter(([, socket]) => socket.readyState === 1)
    .map(([url, socket]) => ({ url, socket, role: roles.get(socket) }));

  const ranked = open
    .filter(entry => !entry.role?.chat && (entry.role?.signals.size ?? 0) > 0)
    .sort((a, b) => (b.role?.score ?? 0) - (a.role?.score ?? 0));
  if (ranked[0]) return ranked[0].socket;

  // Cold start / pure city: room is up but role scoring not primed yet.
  const fallback = open
    .filter(entry => !entry.role?.chat)
    .sort((a, b) => (b.role?.messages ?? 0) - (a.role?.messages ?? 0));
  return fallback[0]?.socket;
}

export function gameplayConnected(): boolean {
  return Boolean(gameplaySocket());
}

/**
 * Chat Colyseus room (rt3…). Used for aucshare / market channel, not hunt combat.
 */
function chatSocket(): WebSocket | undefined {
  const open = [...sockets.entries()]
    .filter(([, socket]) => socket.readyState === 1)
    .map(([url, socket]) => ({ url, socket, role: roles.get(socket) }));

  const chat = open
    .filter(entry => entry.role?.chat)
    .sort((a, b) => (b.role?.messages ?? 0) - (a.role?.messages ?? 0));
  if (chat[0]) return chat[0].socket;

  // Fallback: non-gameplay open room (usually chat on rt3).
  const gameplay = gameplaySocket();
  const other = open
    .filter(entry => entry.socket !== gameplay && !entry.role?.chat)
    .sort((a, b) => (b.role?.messages ?? 0) - (a.role?.messages ?? 0));
  // Prefer sockets that already look like chat hosts
  const rtChat = other.find(entry => /rt3\.|\/chat/i.test(entry.url));
  if (rtChat) return rtChat.socket;
  if (other[0]) return other[0].socket;
  return undefined;
}

export function chatConnected(): boolean {
  return Boolean(chatSocket());
}

export function sendRawPacket(base64: string): boolean {
  const socket = gameplaySocket();
  if (!socket) return false;
  socket.send(Uint8Array.from(atob(base64), char => char.charCodeAt(0)));
  return true;
}

/** Send on chat room WS (e.g. aucshare). */
export function sendChatPacket(base64: string): boolean {
  const socket = chatSocket();
  if (!socket) return false;
  socket.send(Uint8Array.from(atob(base64), char => char.charCodeAt(0)));
  return true;
}

export function onGamePacket(
  listener: (bytes: Uint8Array, receivedAt: number) => void
): () => void {
  packetListeners.add(listener);
  return () => packetListeners.delete(listener);
}

/** Outgoing gameplay WS frames (for probes / debugging). */
export function onOutgoingPacket(
  listener: (bytes: Uint8Array, url: string) => void
): () => void {
  outgoingListeners.add(listener);
  return () => outgoingListeners.delete(listener);
}

export function gameplaySocketUrl(): string | undefined {
  return gameplaySocket()?.url;
}
