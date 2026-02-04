// src/utils/currency.ts
export const formatCurrency = (amount: number, currency: string = "USD") => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
      }).format(amount);
    } catch {
      // fallback if Intl doesn't support the currency
      return `${amount} ${currency}`;
    }
  };
  