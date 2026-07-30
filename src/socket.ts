import { createSocketRole, observeSocket, type SocketRole } from "./socket-role";

declare const unsafeWindow: Window & typeof globalThis;

const page = unsafeWindow;
const monitored = /^wss?:\/\/(?:rt\d+\.)?baiakidle\.com(?:\/|$)/i;
const sockets = new Map<string, WebSocket>();
const roles = new Map<WebSocket, SocketRole>();
const seen = new WeakSet<WebSocket>();

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

async function bytes(data: SocketData): Promise<Uint8Array> {
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(data);
}

function receive(socket: WebSocket, data: SocketData): void {
  void bytes(data).then(value => observeSocket(roles.get(socket)!, value));
}

function monitor(url: string, socket: WebSocket, early?: EarlyRecord): void {
  if (!monitored.test(url) || seen.has(socket)) return;
  seen.add(socket);
  sockets.set(url, socket);
  roles.set(socket, createSocketRole());

  if (early) {
    early.dispatch = data => receive(socket, data);
    for (const data of early.messages.splice(0)) receive(socket, data);
  } else {
    socket.addEventListener("message", event => receive(socket, event.data));
  }
  socket.addEventListener("close", () => {
    sockets.delete(url);
    roles.delete(socket);
  });
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
  nativeSend.call(this, data);
};

function gameplaySocket(): WebSocket | undefined {
  return [...sockets.values()]
    .filter(socket =>
      socket.readyState === 1 &&
      !roles.get(socket)?.chat &&
      (roles.get(socket)?.signals.size ?? 0) > 0
    )
    .sort((a, b) => (roles.get(b)?.score ?? 0) - (roles.get(a)?.score ?? 0))[0];
}

export function gameplayConnected(): boolean {
  return Boolean(gameplaySocket());
}

export function sendRawPacket(base64: string): boolean {
  const socket = gameplaySocket();
  if (!socket) return false;
  socket.send(Uint8Array.from(atob(base64), char => char.charCodeAt(0)));
  return true;
}