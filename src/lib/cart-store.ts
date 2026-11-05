import { CART_LIMITS } from "./cart-limits";
export type PrintAsset = {
  id: string;
  png: Blob;
  preview: string;
  caption: string;
  filterId: string;
  dateLabel: string;
  sufficient: boolean;
  createdAt: number;
};
export type CartLine = { stripId: string; quantity: number; preview: string };
export type PendingCart = { requestId: string; lines: CartLine[]; submitted?: boolean };

let database: Promise<IDBDatabase> | undefined;
function db() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("incsoul-print", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("assets"))
        request.result.createObjectStore("assets", { keyPath: "id" });
      if (!request.result.objectStoreNames.contains("cart"))
        request.result.createObjectStore("cart", { keyPath: "stripId" });
      if (!request.result.objectStoreNames.contains("state"))
        request.result.createObjectStore("state");
      if (!request.result.objectStoreNames.contains("info"))
        request.result.createObjectStore("info", { keyPath: "id" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        database = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      database = undefined;
      reject(new Error("Не удалось открыть хранилище"));
    };
    request.onblocked = () => reject(new Error("Закройте другие вкладки приложения"));
  });
  return database;
}

async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction, done: (value: T) => void) => void,
) {
  const database = await db();
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(stores, mode);
    let value: T;
    tx.oncomplete = () => resolve(value);
    tx.onerror = tx.onabort = () =>
      reject(
        new Error(
          "Не удалось сохранить фотоленту. Проверьте свободное место и доступ к хранилищу.",
        ),
      );
    try {
      run(tx, (result) => {
        value = result;
      });
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

const channel =
  typeof window === "undefined" || typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel("incsoul-cart");
export function announceCart() {
  window.dispatchEvent(new Event("incsoul-cart"));
  channel?.postMessage("changed");
}
if (typeof window !== "undefined" && channel)
  channel.onmessage = () => window.dispatchEvent(new Event("incsoul-cart"));

export async function savePrintAsset(asset: PrintAsset) {
  await transaction<void>(["assets", "info"], "readwrite", (tx) => {
    const store = tx.objectStore("assets");
    const all = store.getAll();
    all.onsuccess = () => {
      const total = (all.result as PrintAsset[]).reduce((sum, item) => sum + item.png.size, 0);
      if (
        total + asset.png.size > 150 * 1024 * 1024 &&
        !all.result.some((item: PrintAsset) => item.id === asset.id)
      ) {
        tx.abort();
      } else {
        store.get(asset.id).onsuccess = (event) => {
          if (!(event.target as IDBRequest).result) store.add(asset);
          tx.objectStore("info").put({ id: asset.id, sufficient: asset.sufficient });
        };
      }
    };
  });
}
export function readPrintAsset(id: string) {
  return transaction<PrintAsset | undefined>(["assets"], "readonly", (tx, done) => {
    tx.objectStore("assets").get(id).onsuccess = (event) =>
      done((event.target as IDBRequest).result);
  });
}
export function readCart() {
  return transaction<{ lines: CartLine[]; pending?: PendingCart }>(
    ["cart", "state"],
    "readonly",
    (tx, done) => {
      const lines = tx.objectStore("cart").getAll();
      lines.onsuccess = () => {
        const pending = tx.objectStore("state").get("pending");
        pending.onsuccess = () => done({ lines: lines.result, pending: pending.result });
      };
    },
  );
}
export async function changeCart(id: string, quantity: number | "add") {
  await transaction<void>(["cart", "state", "assets"], "readwrite", (tx) => {
    const cart = tx.objectStore("cart");
    tx.objectStore("state").get("pending").onsuccess = (event) => {
      if ((event.target as IDBRequest).result) {
        tx.abort();
        return;
      }
      if (quantity === "add") {
        tx.objectStore("assets").get(id).onsuccess = (event) => {
          const asset = (event.target as IDBRequest<PrintAsset>).result;
          if (!asset?.sufficient || !(asset.png instanceof Blob)) {
            tx.abort();
            return;
          }
          cart.get(id).onsuccess = (event) => {
            if (!(event.target as IDBRequest).result)
              cart.put({ stripId: id, quantity: 1, preview: asset.preview });
          };
        };
      } else if (quantity === 0) cart.delete(id);
      else if (Number.isInteger(quantity) && quantity >= 1 && quantity <= CART_LIMITS.perStrip) {
        cart.get(id).onsuccess = (event) => {
          const line = (event.target as IDBRequest<CartLine>).result;
          if (line) cart.put({ ...line, quantity });
        };
      }
    };
  });
  announceCart();
}
export async function beginCartOrder() {
  const pending = await transaction<PendingCart>(["cart", "state"], "readwrite", (tx, done) => {
    const state = tx.objectStore("state");
    state.get("pending").onsuccess = (event) => {
      const existing = (event.target as IDBRequest<PendingCart>).result;
      if (existing) {
        done(existing);
        return;
      }
      tx.objectStore("cart").getAll().onsuccess = (event) => {
        const pending = {
          requestId: crypto.randomUUID(),
          lines: (event.target as IDBRequest<CartLine[]>).result,
        };
        state.put(pending, "pending");
        done(pending);
      };
    };
  });
  announceCart();
  return pending;
}
export async function finishCartOrder(requestId: string, success: boolean) {
  await transaction<void>(["cart", "state"], "readwrite", (tx) => {
    const state = tx.objectStore("state");
    state.get("pending").onsuccess = (event) => {
      const pending = (event.target as IDBRequest<PendingCart>).result;
      if (pending?.requestId !== requestId) return;
      if (success) pending.lines.forEach((line) => tx.objectStore("cart").delete(line.stripId));
      state.delete("pending");
    };
  });
  announceCart();
}

export function readPrintInfo(id: string) {
  return transaction<{ id: string; sufficient: boolean } | undefined>(
    ["info"],
    "readonly",
    (tx, done) => {
      tx.objectStore("info").get(id).onsuccess = (event) =>
        done((event.target as IDBRequest).result);
    },
  );
}

export async function releasePrintAsset(id: string) {
  await transaction<void>(["assets", "info", "cart"], "readwrite", (tx) => {
    tx.objectStore("cart").get(id).onsuccess = (event) => {
      if (!(event.target as IDBRequest).result) {
        tx.objectStore("assets").delete(id);
        tx.objectStore("info").delete(id);
      }
    };
  });
}

export async function markCartSubmitted(requestId: string) {
  await transaction<void>(["state"], "readwrite", (tx) => {
    const state = tx.objectStore("state");
    state.get("pending").onsuccess = (event) => {
      const pending = (event.target as IDBRequest<PendingCart>).result;
      if (pending?.requestId === requestId) state.put({ ...pending, submitted: true }, "pending");
      else tx.abort();
    };
  });
}
