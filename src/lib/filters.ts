export type FilterId =
  | "none"
  | "mono"
  | "noir"
  | "vintage"
  | "warm"
  | "cool"
  | "vivid";

export type FilterPreset = {
  id: FilterId;
  label: string;
  css: string;
};

export const FILTERS: FilterPreset[] = [
  { id: "none", label: "Без фильтров", css: "none" },
  { id: "mono", label: "Ч/Б", css: "grayscale(1) contrast(1.08)" },
  { id: "noir", label: "Нуар", css: "grayscale(1) contrast(1.32) brightness(0.94)" },
  { id: "vintage", label: "Плёнка", css: "sepia(0.42) contrast(1.08) saturate(0.82)" },
  { id: "warm", label: "Тёплый", css: "sepia(0.18) saturate(1.12) brightness(1.04)" },
  { id: "cool", label: "Холодный", css: "hue-rotate(12deg) saturate(0.88) brightness(1.04)" },
  { id: "vivid", label: "Яркий", css: "saturate(1.32) contrast(1.1)" },
];

export function getFilter(id: FilterId): FilterPreset {
  return FILTERS.find((f) => f.id === id) ?? FILTERS[0];
}
