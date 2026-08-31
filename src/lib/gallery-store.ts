import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { LayoutId } from "@/lib/layouts";
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
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? noopStorage : localStorage,
      ),
    },
  ),
);
