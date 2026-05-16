import { API_CORE_BASE_URL, authHeaders, getAuthToken } from "../../shared/api";

export type StockHolding = {
  id: string;
  symbol: string;
  asset_name: string;
  market: string;
  quantity: number;
  average_price: number;
  currency: string;
  sector: string;
  memo: string;
  created_at: string;
  updated_at: string;
};

export type StockHoldingInput = {
  symbol: string;
  assetName: string;
  market: string;
  quantity: number;
  averagePrice: number;
  currency: string;
  sector: string;
  memo: string;
};

export type StockQuote = {
  symbol: string;
  asset_name: string;
  market: string;
  price: number;
  previous_close: number;
  change: number;
  change_rate: number;
  volume: number;
  timestamp: string;
};

export type StockSearchResult = {
  symbol: string;
  name: string;
  exchange: string;
  market: string;
  quote_type: string;
  currency: string;
};

export type StockHistoryPoint = {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type StockCashBalance = {
  amount: number;
  currency: string;
  updated_at: string;
};

const parseJson = async <T>(response: Response): Promise<T> => {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : `요청에 실패했습니다. (${response.status})`;
    throw new Error(message);
  }
  return data as T;
};

const request = async <T>(path: string, init?: RequestInit) => {
  const response = await fetch(`${API_CORE_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  return parseJson<T>(response);
};

const toRequestBody = (input: StockHoldingInput) => ({
  symbol: input.symbol,
  asset_name: input.assetName,
  market: input.market,
  quantity: input.quantity,
  average_price: input.averagePrice,
  currency: input.currency,
  sector: input.sector,
  memo: input.memo,
});

export const listStockHoldings = () => request<StockHolding[]>("/api/stocks/holdings");

export const createStockHolding = (input: StockHoldingInput) =>
  request<StockHolding>("/api/stocks/holdings", {
    method: "POST",
    body: JSON.stringify(toRequestBody(input)),
  });

export const updateStockHolding = (id: string, input: StockHoldingInput) =>
  request<{ message: string; updated_holding?: StockHolding; updatedHolding?: StockHolding }>(`/api/stocks/holdings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(toRequestBody(input)),
  });

export const deleteStockHolding = (id: string) =>
  request<{ message: string; deleted_holding: StockHolding }>(`/api/stocks/holdings/${id}`, {
    method: "DELETE",
  });

export const listStockQuotes = () => request<StockQuote[]>("/api/stocks/quotes");

export const listStockHistory = (symbol: string, period: string) =>
  request<StockHistoryPoint[]>(`/api/stocks/history?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}`);

export const searchStocks = (query: string) =>
  request<StockSearchResult[]>(`/api/stocks/search?q=${encodeURIComponent(query)}`);

export const getStockCashBalance = () => request<StockCashBalance>("/api/stocks/cash");

export const updateStockCashBalance = (input: { amount: number; currency: string }) =>
  request<StockCashBalance>("/api/stocks/cash", {
    method: "PATCH",
    body: JSON.stringify(input),
  });

export const createStockStream = () => {
  const token = getAuthToken();
  if (!token) return null;
  return new EventSource(`${API_CORE_BASE_URL}/api/stocks/stream?token=${encodeURIComponent(token)}`);
};
