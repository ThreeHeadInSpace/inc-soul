export const S3_PRODUCT = { price: 169, currency: "RUB" } as const;

export const PRINT_PRICE_RUB = 49;
export const SHIPPING_PRICE_RUB = 29;
export const EXTRA_AFTER = 5;
export const EXTRA_STEP_RUB = 10;
export const MAX_COPIES = 12;

export function copiesPrintTotal(copies: number, unit: number) {
  const safe = Math.max(1, Math.min(MAX_COPIES, Math.round(copies)));
  let print = 0;
  for (let i = 1; i <= safe; i += 1) {
    print += i <= EXTRA_AFTER ? unit : unit + EXTRA_STEP_RUB;
  }
  return print;
}

export function orderTotal(copies: number, unit = PRINT_PRICE_RUB) {
  const safe = Math.max(1, Math.min(MAX_COPIES, Math.round(copies)));
  const print = copiesPrintTotal(safe, unit);
  return {
    copies: safe,
    print,
    shipping: SHIPPING_PRICE_RUB,
    total: print + SHIPPING_PRICE_RUB,
  };
}
