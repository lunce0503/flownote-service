const ISO_CURRENCY_PATTERN = /^[A-Z]{3}$/;

const currencyAliases: Record<string, string> = {
  원: "KRW",
  원화: "KRW",
  한국돈: "KRW",
  달러: "USD",
  달라: "USD",
  미국달러: "USD",
  엔: "JPY",
  엔화: "JPY",
  유로: "EUR",
};

export const normalizeCurrencyCode = (currency?: string) => {
  const normalized = (currency || "KRW").trim().toUpperCase();
  return currencyAliases[normalized] ?? (ISO_CURRENCY_PATTERN.test(normalized) ? normalized : "KRW");
};

export const formatMoney = (value: number, currency = "KRW") => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeCurrency = normalizeCurrencyCode(currency);

  try {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits: safeCurrency === "KRW" || safeCurrency === "JPY" ? 0 : 2,
    }).format(safeValue);
  } catch {
    return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(safeValue);
  }
};

export const formatNumber = (value: number, maximumFractionDigits = 4) =>
  new Intl.NumberFormat("ko-KR", { maximumFractionDigits }).format(Number.isFinite(value) ? value : 0);
