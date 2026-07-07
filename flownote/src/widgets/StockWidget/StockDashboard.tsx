import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Save,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import {
  createStockHolding,
  createStockStream,
  deleteStockHolding,
  getStockCashBalance,
  listStockHoldings,
  listStockQuotes,
  searchStocks,
  updateStockCashBalance,
  updateStockHolding,
  type StockCashBalance,
  type StockHolding,
  type StockHoldingInput,
  type StockQuote,
  type StockSearchResult,
} from "@/entities/stocks";
import { formatMoney, formatNumber, normalizeCurrencyCode } from "./format";

const EMPTY_FORM: StockHoldingInput = {
  symbol: "",
  assetName: "",
  market: "KRX",
  quantity: 0,
  averagePrice: 0,
  currency: "KRW",
  sector: "",
  memo: "",
};

const toHoldingInput = (holding: StockHolding): StockHoldingInput => ({
  symbol: holding.symbol,
  assetName: holding.asset_name,
  market: holding.market,
  quantity: holding.quantity,
  averagePrice: holding.average_price,
  currency: normalizeCurrencyCode(holding.currency),
  sector: holding.sector,
  memo: holding.memo,
});

const fieldClassName = "w-full min-w-0 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:bg-white";
const compactFieldClassName = "w-full min-w-0 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-emerald-500";
const labelClassName = "min-w-0 text-xs font-bold text-stone-500";

const marketCountryMap: Record<string, string> = {
  KRX: "한국",
  KSC: "한국",
  KOSPI: "한국",
  KOSDAQ: "한국",
  KS: "한국",
  KQ: "한국",
  NMS: "미국",
  NYQ: "미국",
  NASDAQ: "미국",
  NYSE: "미국",
  AMEX: "미국",
  NGM: "미국",
  GER: "독일",
  FRA: "독일",
  JPX: "일본",
  TSE: "일본",
  HKG: "홍콩",
  HKSE: "홍콩",
  LSE: "영국",
  TOR: "캐나다",
};

const getMarketCountry = (market: string, symbol?: string) => {
  const normalizedMarket = market.trim().toUpperCase();
  const suffix = symbol?.split(".").pop()?.toUpperCase() ?? "";
  if (normalizedMarket) {
    return marketCountryMap[normalizedMarket] ?? "국가 미확인";
  }
  if (suffix) {
    return marketCountryMap[suffix] ?? "국가 미확인";
  }
  return "국가 미확인";
};

const StockDashboard = () => {
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [cash, setCash] = useState<StockCashBalance>({ amount: 0, currency: "KRW", updated_at: "" });
  const [cashDraft, setCashDraft] = useState({ amount: 0, currency: "KRW" });
  const [form, setForm] = useState<StockHoldingInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<StockHoldingInput>(EMPTY_FORM);
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [assetSearchResults, setAssetSearchResults] = useState<StockSearchResult[]>([]);
  const [assetSearchLoading, setAssetSearchLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextHoldings, nextQuotes, nextCash] = await Promise.all([
        listStockHoldings(),
        listStockQuotes(),
        getStockCashBalance(),
      ]);
      setHoldings(nextHoldings);
      setQuotes(Object.fromEntries(nextQuotes.map((quote) => [quote.symbol, quote])));
      setCash(nextCash);
      setCashDraft({ amount: nextCash.amount, currency: normalizeCurrencyCode(nextCash.currency) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "주식 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const source = createStockStream();
    if (!source) return undefined;

    setStreaming(true);
    source.addEventListener("quotes", (event) => {
      const nextQuotes = JSON.parse((event as MessageEvent).data) as StockQuote[];
      setQuotes(Object.fromEntries(nextQuotes.map((quote) => [quote.symbol, quote])));
    });
    source.onerror = () => {
      setStreaming(false);
      source.close();
    };

    return () => {
      source.close();
      setStreaming(false);
    };
  }, [holdings.length]);

  useEffect(() => {
    const normalized = assetSearchQuery.trim();
    if (normalized.length < 2) {
      setAssetSearchResults([]);
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setAssetSearchLoading(true);
      searchStocks(normalized)
        .then(setAssetSearchResults)
        .catch(() => setAssetSearchResults([]))
        .finally(() => setAssetSearchLoading(false));
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [assetSearchQuery]);

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return holdings
      .filter((holding) => {
        if (!normalized) return true;
        return [holding.symbol, holding.asset_name, holding.market, holding.sector]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      })
      .map((holding) => {
        const quote = quotes[holding.symbol];
        const currentPrice = quote?.price ?? holding.average_price;
        const invested = holding.quantity * holding.average_price;
        const currentValue = holding.quantity * currentPrice;
        const profit = currentValue - invested;
        const profitRate = invested === 0 ? 0 : (profit / invested) * 100;
        return { holding, quote, currentPrice, invested, currentValue, profit, profitRate };
      })
      .sort((a, b) => b.currentValue - a.currentValue);
  }, [holdings, query, quotes]);

  const portfolio = useMemo(() => {
    const invested = rows.reduce((sum, row) => sum + row.invested, 0);
    const currentValue = rows.reduce((sum, row) => sum + row.currentValue, 0);
    const profit = currentValue - invested;
    const profitRate = invested === 0 ? 0 : (profit / invested) * 100;
    const totalAssets = currentValue + cash.amount;
    return { invested, currentValue, profit, profitRate, totalAssets };
  }, [cash.amount, rows]);

  const sectorWeights = useMemo(() => {
    const total = portfolio.currentValue || 1;
    const grouped = rows.reduce<Record<string, number>>((acc, row) => {
      const sector = row.holding.sector || "분류 없음";
      acc[sector] = (acc[sector] ?? 0) + row.currentValue;
      return acc;
    }, {});
    return Object.entries(grouped)
      .map(([sector, value]) => ({ sector, value, weight: (value / total) * 100 }))
      .sort((a, b) => b.value - a.value);
  }, [portfolio.currentValue, rows]);

  const handleSubmit = async () => {
    if (!form.symbol.trim()) {
      setError("종목 코드는 필수입니다.");
      return;
    }
    setError(null);
    try {
      const created = await createStockHolding({
        ...form,
        symbol: form.symbol.trim().toUpperCase(),
        assetName: form.assetName.trim() || form.symbol.trim().toUpperCase(),
        currency: normalizeCurrencyCode(form.currency),
      });
      setHoldings((prev) => [created, ...prev]);
      setForm(EMPTY_FORM);
      setAssetSearchQuery("");
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "보유 자산을 저장하지 못했습니다.");
    }
  };

  const handleSelectSearchResult = (result: StockSearchResult) => {
    setForm((prev) => ({
      ...prev,
      symbol: result.symbol,
      assetName: result.name,
      market: result.exchange || result.market || prev.market,
      currency: normalizeCurrencyCode(result.currency || prev.currency),
    }));
    setAssetSearchQuery(`${result.symbol} ${result.name}`);
    setAssetSearchResults([]);
  };

  const handleDelete = async (holding: StockHolding) => {
    setHoldings((prev) => prev.filter((item) => item.id !== holding.id));
    try {
      await deleteStockHolding(holding.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "보유 자산을 삭제하지 못했습니다.");
      void refresh();
    }
  };

  const handleSaveCash = async () => {
    setError(null);
    try {
      const nextCash = await updateStockCashBalance({
        ...cashDraft,
        currency: normalizeCurrencyCode(cashDraft.currency),
      });
      setCash(nextCash);
      setCashDraft({ amount: nextCash.amount, currency: normalizeCurrencyCode(nextCash.currency) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "현금 잔액을 저장하지 못했습니다.");
    }
  };

  const startEdit = (holding: StockHolding) => {
    setEditingId(holding.id);
    setEditForm(toHoldingInput(holding));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  };

  const handleSaveEdit = async (holding: StockHolding) => {
    setError(null);
    try {
      const result = await updateStockHolding(holding.id, {
        ...editForm,
        currency: normalizeCurrencyCode(editForm.currency),
      });
      const updated = result.updatedHolding ?? result.updated_holding;
      if (updated) {
        setHoldings((prev) => prev.map((item) => (item.id === holding.id ? updated : item)));
      }
      cancelEdit();
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "보유 자산을 수정하지 못했습니다.");
    }
  };

  return (
    <main className="min-h-[calc(100vh-56px)] bg-stone-950 p-3 text-stone-900 md:p-5">
      <section className="mx-auto max-w-7xl rounded-2xl border border-stone-200 bg-stone-50 p-4 shadow-xl md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700">Portfolio Stream</p>
            <h1 className="text-2xl font-black text-stone-950 md:text-3xl">주식 자산 관리</h1>
            <p className="text-sm text-stone-500">보유 종목을 저장하고 실시간 시세 흐름으로 손익과 구성 비중을 확인합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/stocks/chart"
              className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-3 py-2 text-sm font-bold text-white"
            >
              <BarChart3 size={16} />
              차트 보기
            </Link>
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold ${
              streaming ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-600"
            }`}>
              <Activity size={16} />
              {streaming ? "Live" : "Offline"}
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-3 py-2 text-sm font-bold text-white"
            >
              <RefreshCw size={16} />
              새로고침
            </button>
          </div>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-5">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <Wallet className="mb-3 text-emerald-600" size={20} />
            <div className="text-xs font-bold text-stone-400">총 자산</div>
            <div className="mt-1 text-xl font-black">{formatMoney(portfolio.totalAssets, cash.currency)}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <Wallet className="mb-3 text-stone-500" size={20} />
            <div className="text-xs font-bold text-stone-400">평가 금액</div>
            <div className="mt-1 text-xl font-black">{formatMoney(portfolio.currentValue)}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <BarChart3 className="mb-3 text-stone-500" size={20} />
            <div className="text-xs font-bold text-stone-400">투입 원금</div>
            <div className="mt-1 text-xl font-black">{formatMoney(portfolio.invested)}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            {portfolio.profit >= 0 ? <TrendingUp className="mb-3 text-red-500" size={20} /> : <TrendingDown className="mb-3 text-blue-500" size={20} />}
            <div className="text-xs font-bold text-stone-400">평가 손익</div>
            <div className={`mt-1 text-xl font-black ${portfolio.profit >= 0 ? "text-red-600" : "text-blue-600"}`}>
              {formatMoney(portfolio.profit)}
            </div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <Activity className="mb-3 text-stone-500" size={20} />
            <div className="text-xs font-bold text-stone-400">수익률</div>
            <div className={`mt-1 text-xl font-black ${portfolio.profitRate >= 0 ? "text-red-600" : "text-blue-600"}`}>
              {portfolio.profitRate.toFixed(2)}%
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-3">
          <div className="mb-3 grid gap-3 md:grid-cols-[minmax(180px,1fr)_120px_auto]">
            <label className="min-w-0 space-y-1">
              <span className={labelClassName}>보유 현금</span>
              <input
                type="number"
                min="0"
                className={fieldClassName}
                value={cashDraft.amount}
                onChange={(event) => setCashDraft((prev) => ({ ...prev, amount: Number(event.target.value) }))}
                placeholder="현금 금액"
              />
            </label>
            <label className="min-w-0 space-y-1">
              <span className={labelClassName}>통화</span>
              <input
                className={fieldClassName}
                value={cashDraft.currency}
                onChange={(event) => setCashDraft((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
                placeholder="KRW"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleSaveCash()}
              className="inline-flex items-center justify-center gap-2 self-end rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white"
            >
              <Save size={18} />
              현금 저장
            </button>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <label className="relative min-w-0 space-y-1 sm:col-span-2 lg:col-span-2">
              <span className={labelClassName}>종목 검색</span>
              <input
                className={fieldClassName}
                value={assetSearchQuery}
                onChange={(event) => {
                  setAssetSearchQuery(event.target.value);
                  setForm((prev) => ({ ...prev, symbol: event.target.value }));
                }}
                placeholder="종목코드 또는 주식명 검색"
              />
              {(assetSearchLoading || assetSearchResults.length > 0) ? (
                <div className="absolute left-0 right-0 top-16 z-20 max-h-72 overflow-auto rounded-xl border border-stone-200 bg-white p-1 shadow-xl">
                  {assetSearchLoading ? (
                    <div className="px-3 py-3 text-sm text-stone-400">Yahoo Finance 검색 중...</div>
                  ) : assetSearchResults.map((result) => (
                    <button
                      key={`${result.symbol}-${result.exchange}`}
                      type="button"
                      onClick={() => handleSelectSearchResult(result)}
                      className="block w-full rounded-lg px-3 py-2 text-left hover:bg-stone-100"
                    >
                      <div className="text-sm font-black text-stone-950">{result.symbol}</div>
                      <div className="text-xs text-stone-500">{result.name} · {result.exchange || result.market || "Yahoo Finance"}</div>
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
            <label className="min-w-0 space-y-1">
              <span className={labelClassName}>종목명</span>
              <input className={fieldClassName} value={form.assetName} onChange={(event) => setForm((prev) => ({ ...prev, assetName: event.target.value }))} placeholder="예: 삼성전자" />
            </label>
            <label className="min-w-0 space-y-1">
              <span className={labelClassName}>시장</span>
              <input className={fieldClassName} value={form.market} onChange={(event) => setForm((prev) => ({ ...prev, market: event.target.value }))} placeholder="KRX" />
            </label>
            <label className="min-w-0 space-y-1">
              <span className={labelClassName}>주식 개수</span>
              <input type="number" min="0" className={fieldClassName} value={form.quantity} onChange={(event) => setForm((prev) => ({ ...prev, quantity: Number(event.target.value) }))} placeholder="보유 수량" />
            </label>
            <label className="min-w-0 space-y-1">
              <span className={labelClassName}>매입가</span>
              <input type="number" min="0" className={fieldClassName} value={form.averagePrice} onChange={(event) => setForm((prev) => ({ ...prev, averagePrice: Number(event.target.value) }))} placeholder="1주 평균 단가" />
            </label>
            <label className="min-w-0 space-y-1 sm:col-span-2 lg:col-span-2">
              <span className={labelClassName}>섹터</span>
              <input className={fieldClassName} value={form.sector} onChange={(event) => setForm((prev) => ({ ...prev, sector: event.target.value }))} placeholder="예: 반도체" />
            </label>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              className="inline-flex min-w-0 items-center justify-center gap-2 self-end rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white sm:col-span-2 lg:col-span-1"
            >
              <Plus size={18} />
              추가
            </button>
          </div>
        </div>

        {error ? <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-2xl border border-stone-200 bg-white p-3">
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
              <Search size={16} className="text-stone-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="종목, 시장, 섹터 검색"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-xs uppercase text-stone-400">
                    <th className="py-3">종목</th>
                    <th>시장 / 국가</th>
                    <th>현재가</th>
                    <th>등락</th>
                    <th>보유</th>
                    <th>매입가</th>
                    <th>평가금</th>
                    <th>손익</th>
                    <th>거래량</th>
                    <th className="text-right">메뉴</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={10} className="py-16 text-center text-stone-400">불러오는 중...</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={10} className="py-16 text-center text-stone-400">등록된 보유 자산이 없습니다.</td></tr>
                  ) : rows.map((row) => (
                    <tr key={row.holding.id} className="border-b border-stone-100">
                      <td className="py-3">
                        {editingId === row.holding.id ? (
                          <div className="space-y-2">
                            <input
                              className={compactFieldClassName}
                              value={editForm.symbol}
                              onChange={(event) => setEditForm((prev) => ({ ...prev, symbol: event.target.value }))}
                              aria-label="종목 코드"
                            />
                            <input
                              className={compactFieldClassName}
                              value={editForm.assetName}
                              onChange={(event) => setEditForm((prev) => ({ ...prev, assetName: event.target.value }))}
                              aria-label="종목명"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="font-black text-stone-950">{row.holding.symbol}</div>
                            <div className="text-xs text-stone-500">{row.holding.asset_name}</div>
                          </>
                        )}
                      </td>
                      <td>
                        {editingId === row.holding.id ? (
                          <div className="space-y-1">
                            <input
                              className={compactFieldClassName}
                              value={editForm.market}
                              onChange={(event) => setEditForm((prev) => ({ ...prev, market: event.target.value }))}
                              aria-label="시장"
                            />
                            <div className="text-xs font-bold text-stone-400">{getMarketCountry(editForm.market, editForm.symbol)}</div>
                          </div>
                        ) : (
                          <>
                            <div className="font-bold text-stone-700">{row.holding.market || "-"}</div>
                            <div className="text-xs font-bold text-emerald-700">{getMarketCountry(row.holding.market, row.holding.symbol)}</div>
                          </>
                        )}
                      </td>
                      <td className="font-bold">{formatMoney(row.currentPrice, row.holding.currency)}</td>
                      <td className={row.quote && row.quote.change >= 0 ? "text-red-600" : "text-blue-600"}>
                        {row.quote ? `${formatMoney(row.quote.change, row.holding.currency)} (${row.quote.change_rate.toFixed(2)}%)` : "-"}
                      </td>
                      <td>
                        {editingId === row.holding.id ? (
                          <input
                            type="number"
                            min="0"
                            className={compactFieldClassName}
                            value={editForm.quantity}
                            onChange={(event) => setEditForm((prev) => ({ ...prev, quantity: Number(event.target.value) }))}
                            aria-label="주식 개수"
                          />
                        ) : `${formatNumber(row.holding.quantity)}주`}
                      </td>
                      <td>
                        {editingId === row.holding.id ? (
                          <input
                            type="number"
                            min="0"
                            className={compactFieldClassName}
                            value={editForm.averagePrice}
                            onChange={(event) => setEditForm((prev) => ({ ...prev, averagePrice: Number(event.target.value) }))}
                            aria-label="매입가"
                          />
                        ) : formatMoney(row.holding.average_price, row.holding.currency)}
                      </td>
                      <td className="font-bold">{formatMoney(row.currentValue, row.holding.currency)}</td>
                      <td className={row.profit >= 0 ? "font-bold text-red-600" : "font-bold text-blue-600"}>
                        {formatMoney(row.profit, row.holding.currency)} ({row.profitRate.toFixed(2)}%)
                      </td>
                      <td>{row.quote ? formatNumber(row.quote.volume) : "-"}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          {editingId === row.holding.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleSaveEdit(row.holding)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 text-emerald-700"
                                aria-label="수정 저장"
                              >
                                <Save size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 text-stone-600"
                                aria-label="수정 취소"
                              >
                                <X size={16} />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit(row.holding)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 text-stone-700"
                              aria-label="보유 자산 수정"
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleDelete(row.holding)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600"
                            aria-label="보유 자산 삭제"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-black text-stone-900">구성 비중</h2>
              <div className="space-y-3">
                {sectorWeights.length === 0 ? (
                  <div className="text-sm text-stone-400">보유 자산을 추가하면 비중이 표시됩니다.</div>
                ) : sectorWeights.map((item) => (
                  <div key={item.sector}>
                    <div className="mb-1 flex justify-between text-xs font-bold text-stone-600">
                      <span>{item.sector}</span>
                      <span>{item.weight.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(item.weight, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-900 p-4 text-white">
              <h2 className="mb-2 text-sm font-black">스트리밍 보드</h2>
              <p className="text-xs text-stone-300">
                등록된 보유 종목 기준으로 서버 SSE가 약 5초마다 Yahoo Finance 시세, 등락률, 거래량을 갱신합니다.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
};

export default StockDashboard;
