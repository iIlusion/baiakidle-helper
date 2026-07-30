import { readFile, writeFile } from "node:fs/promises";

const common = `// @match https://baiakidle.com/jogar/
// @match https://baiakidle.com/jogar/*
// @run-at document-start`;
const banner = `// ==UserScript==
// @name BaiakIdle Helper
// @namespace baiakidle-helper
// @version 1.0.0
// @description Auto Sell and Open All Glooth Bag controls for BaiakIdle.
${common}
// @grant unsafeWindow
// ==/UserScript==
`;
const devLoader = `// ==UserScript==
// @name BaiakIdle Helper DEV
// @namespace baiakidle-helper
// @version 1.0.0-dev
${common}
// @sandbox raw
// @grant GM_xmlhttpRequest
// @grant unsafeWindow
// @connect 127.0.0.1
// @downloadURL none
// @updateURL none
// ==/UserScript==

(() => {
  const page = unsafeWindow;
  const monitored = /^wss?:\\/\\/(?:rt\\d+\\.)?baiakidle\\.com(?:\\/|$)/i;

  if (!page.__BAIAKIDLE_HELPER_EARLY_WS__) {
    const NativeWebSocket = page.WebSocket;
    const records = [];
    const subscribers = [];

    function EarlyWebSocket(url, protocols) {
      const socket = protocols === undefined
        ? new NativeWebSocket(url)
        : new NativeWebSocket(url, protocols);
      if (!monitored.test(String(url))) return socket;

      const record = { url: String(url), socket, messages: [], dispatch: null };
      socket.addEventListener("message", event => {
        if (record.dispatch) record.dispatch(event.data);
        else if (record.messages.length < 500) record.messages.push(event.data);
      });
      records.push(record);
      for (const subscriber of subscribers) subscriber(record);
      return socket;
    }

    EarlyWebSocket.prototype = NativeWebSocket.prototype;
    Object.setPrototypeOf(EarlyWebSocket, NativeWebSocket);
    page.WebSocket = EarlyWebSocket;
    page.__BAIAKIDLE_HELPER_EARLY_WS__ = {
      native: NativeWebSocket,
      subscribe(subscriber) {
        subscribers.push(subscriber);
        for (const record of records) subscriber(record);
      }
    };
  }

  GM_xmlhttpRequest({
    method: "GET",
    url: "http://127.0.0.1:8946/baiakidle-helper.user.js?t=" + Date.now(),
    onload: response => {
      if (response.status !== 200) {
        console.error("[BaiakIdle Helper DEV] bundle HTTP", response.status);
        return;
      }
      eval(response.responseText + "\\n//# sourceURL=baiakidle-helper.dev.js");
    },
    onerror: error => console.error("[BaiakIdle Helper DEV] run npm run dev", error)
  });
})();
`;

const file = "dist/baiakidle-helper.user.js";
await Promise.all([
  writeFile(file, banner + await readFile(file, "utf8")),
  writeFile("dist/baiakidle-helper.dev.user.js", devLoader)
]);