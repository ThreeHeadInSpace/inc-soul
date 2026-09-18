import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getLayout, type LayoutId } from "@/lib/layouts";
import type { FilterId } from "@/lib/filters";

export type GalleryItem = {
  id: string;
  layoutId: LayoutId;
  filterId: FilterId;
  composite: string;
  createdAt: number;
  orderNumber?: string;
};

type GalleryState = {
  items: GalleryItem[];
  add: (item: Omit<GalleryItem, "id" | "createdAt"> & { id?: string }) => void;
  remove: (id: string) => void;
  markOrdered: (id: string, orderNumber: string) => void;
};

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

// Persisted browser data may be incomplete or from an interrupted/older write.
// Restore only data, never persisted values for store actions.
function restoredItems(value: unknown): GalleryItem[] {
  if (!value || typeof value !== "object" || !("items" in value) || !Array.isArray(value.items)) return [];
  const seen = new Set<string>();
  return value.items.filter((item): item is GalleryItem => {
    if (!item || typeof item !== "object" ||
      typeof item.id !== "string" || !item.id || seen.has(item.id) ||
      typeof item.layoutId !== "string" || !getLayout(item.layoutId) ||
      typeof item.filterId !== "string" ||
      typeof item.composite !== "string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(item.composite) ||
      typeof item.createdAt !== "number" || !Number.isFinite(item.createdAt) ||
      (item.orderNumber !== undefined && typeof item.orderNumber !== "string")) return false;
    seen.add(item.id);
    return true;
  }).slice(0, 16);
}

export const useGallery = create<GalleryState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) =>
        set((state) => {
          const next: GalleryItem = {
            id: item.id ?? `g-${Date.now()}`,
            layoutId: item.layoutId,
            filterId: item.filterId,
            composite: item.composite,
            createdAt: Date.now(),
            orderNumber: item.orderNumber,
          };
          const without = state.items.filter((i) => i.id !== next.id);
          return { items: [next, ...without].slice(0, 16) };
        }),
      remove: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
      markOrdered: (id, orderNumber) =>
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, orderNumber } : i)),
        })),
    }),
    {
      name: "incsoul-gallery",
      merge: (persisted, current) => ({ ...current, items: restoredItems(persisted) }),
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? noopStorage : localStorage,
      ),
    },
  ),
);
