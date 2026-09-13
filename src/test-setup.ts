const testGlobal = globalThis as typeof globalThis & {
  unsafeWindow?: Window & typeof globalThis;
};

testGlobal.unsafeWindow ??= globalThis as Window & typeof globalThis;
