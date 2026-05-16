import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, BarChart3, RefreshCw } from "lucide-react";
import {
  createStockStream,
  listStockHistory,
  listStockHoldings,
  listStockQuotes,
  type StockHistoryPoint,
  type StockHolding,
  type StockQuote,
} from "../../entities/stocks/api";
import { formatMoney, formatNumber } from "./format";

type CandlePoint = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

type ChartPeriod = "1d" | "1wk" | "1mo" | "1y" | "5y";

const periodOptions: Array<{ value: ChartPeriod; label: string; description: string }> = [
  { value: "1d", label: "일별", description: "오늘" },
  { value: "1wk", label: "주별", description: "1주" },
  { value: "1mo", label: "월별", description: "1개월" },
  { value: "1y", label: "년별", description: "1년" },
  { value: "5y", label: "5년", description: "5년" },
];

const candleFromQuote = (quote: StockQuote, previous?: CandlePoint): CandlePoint => {
  const close = Number.isFinite(quote.price) ? quote.price : previous?.close ?? 0;
  const open = previous?.close ?? quote.previous_close ?? close;
  return {
    time: Date.parse(quote.timestamp) || Date.now(),
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    volume: quote.volume,
  };
};

const candleFromHistory = (point: StockHistoryPoint): CandlePoint => ({
  time: Date.parse(point.timestamp) || Date.now(),
  open: point.open,
  high: point.high,
  low: point.low,
  close: point.close,
  volume: point.volume,
});

const appendQuoteCandles = (
  previous: Record<string, CandlePoint[]>,
  nextQuotes: StockQuote[],
) => {
  const next = { ...previous };
  nextQuotes.forEach((quote) => {
    const current = next[quote.symbol] ?? [];
    next[quote.symbol] = [...current, candleFromQuote(quote, current[current.length - 1])].slice(-48);
  });
  return next;
};

const CandleChart = ({
  candles,
  currency,
  period,
}: {
  candles: CandlePoint[];
  currency: string;
  period: ChartPeriod;
}) => {
  const width = 920;
  const height = 360;
  const padding = { top: 22, right: 84, bottom: 34, left: 16 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const visibleLimit = period === "1d" ? 80 : period === "1wk" ? 90 : 120;
  const visibleCandles = candles.slice(-visibleLimit);

  if (visibleCandles.length === 0) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-white text-sm font-semibold text-stone-400">
        시세가 수신되면 캔들 차트가 표시됩니다.
      </div>
    );
  }

  const prices = visibleCandles.flatMap((candle) => [candle.high, candle.low]);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(max - min, Math.max(max, 1) * 0.002);
  const yFor = (price: number) => padding.top + ((max - price) / range) * plotHeight;
  const candleGap = plotWidth / Math.max(visibleCandles.length, 1);
  const candleWidth = Math.max(3, Math.min(20, candleGap * 0.58));
  const ticks = [max, min + range / 2, min];
  const start = visibleCandles[0];
  const end = visibleCandles[visibleCandles.length - 1];
  const dateFormatter = new Intl.DateTimeFormat("ko-KR", period === "1d" ? {
    hour: "2-digit",
    minute: "2-digit",
  } : {
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[360px] w-full" role="img" aria-label="실시간 캔들 차트">
        <rect width={width} height={height} fill="#fff" />
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={yFor(tick)} y2={yFor(tick)} stroke="#e7e5e4" strokeDasharray="4 4" />
            <text x={width - padding.right + 10} y={yFor(tick) + 4} fontSize="11" fill="#78716c">
              {formatMoney(tick, currency)}
            </text>
          </g>
        ))}
        {visibleCandles.map((candle, index) => {
          const x = padding.left + index * candleGap + candleGap / 2;
          const rising = candle.close >= candle.open;
          const color = rising ? "#dc2626" : "#2563eb";
          const bodyTop = yFor(Math.max(candle.open, candle.close));
          const bodyBottom = yFor(Math.min(candle.open, candle.close));
          const bodyHeight = Math.max(2, bodyBottom - bodyTop);

          return (
            <g key={`${candle.time}-${index}`}>
              <line x1={x} x2={x} y1={yFor(candle.high)} y2={yFor(candle.low)} stroke={color} strokeWidth="2" />
              <rect
                x={x - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={bodyHeight}
                rx="2"
                fill={rising ? "#fee2e2" : "#dbeafe"}
                stroke={color}
                strokeWidth="2"
              />
            </g>
          );
        })}
        {start ? (
          <text x={padding.left} y={height - 10} fontSize="11" fill="#78716c">
            {dateFormatter.format(new Date(start.time))}
          </text>
        ) : null}
        {end ? (
          <text x={width - padding.right - 46} y={height - 10} fontSize="11" fill="#78716c">
            {dateFormatter.format(new Date(end.time))}
          </text>
        ) : null}
      </svg>
    </div>
  );
};

const StockChart = () => {
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [candles, setCandles] = useState<Record<string, CandlePoint[]>>({});
  const [historyCandles, setHistoryCandles] = useState<Record<string, CandlePoint[]>>({});
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [period, setPeriod] = useState<ChartPeriod>("1mo");
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextHoldings, nextQuotes] = await Promise.all([listStockHoldings(), listStockQuotes()]);
      setHoldings(nextHoldings);
      setQuotes(Object.fromEntries(nextQuotes.map((quote) => [quote.symbol, quote])));
      setCandles((prev) => appendQuoteCandles(prev, nextQuotes));
      setSelectedSymbol((prev) => prev || nextHoldings[0]?.symbol || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "차트 데이터를 불러오지 못했습니다.");
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
      setCandles((prev) => appendQuoteCandles(prev, nextQuotes));
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

  const selectedHolding = useMemo(
    () => holdings.find((holding) => holding.symbol === selectedSymbol) ?? holdings[0],
    [holdings, selectedSymbol],
  );
  const selectedQuote = selectedHolding ? quotes[selectedHolding.symbol] : undefined;
  const selectedLiveCandles = selectedHolding ? candles[selectedHolding.symbol] ?? [] : [];
  const selectedHistoryCandles = selectedHolding ? historyCandles[`${selectedHolding.symbol}:${period}`] ?? [] : [];
  const selectedCandles = selectedHistoryCandles.length > 0 ? selectedHistoryCandles : selectedLiveCandles;
  const baselineCandle = selectedCandles[0];
  const latestCandle = selectedCandles[selectedCandles.length - 1];
  const previousCandle = selectedCandles[selectedCandles.length - 2];
  const periodChange = baselineCandle && latestCandle ? latestCandle.close - baselineCandle.open : 0;
  const periodChangeRate = baselineCandle && baselineCandle.open > 0 ? (periodChange / baselineCandle.open) * 100 : 0;
  const previousChange = previousCandle && latestCandle ? latestCandle.close - previousCandle.close : 0;
  const previousChangeRate = previousCandle && previousCandle.close > 0 ? (previousChange / previousCandle.close) * 100 : 0;
  const periodLabel = periodOptions.find((option) => option.value === period)?.description ?? "선택 구간";

  useEffect(() => {
    if (!selectedHolding) return;

    const cacheKey = `${selectedHolding.symbol}:${period}`;
    setHistoryLoading(true);
    listStockHistory(selectedHolding.symbol, period)
      .then((points) => {
        setHistoryCandles((prev) => ({
          ...prev,
          [cacheKey]: points.map(candleFromHistory),
        }));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "과거 차트 데이터를 불러오지 못했습니다.");
      })
      .finally(() => setHistoryLoading(false));
  }, [selectedHolding, period]);

  return (
    <main className="min-h-[calc(100vh-56px)] bg-stone-950 p-3 text-stone-900 md:p-5">
      <section className="mx-auto max-w-7xl rounded-2xl border border-stone-200 bg-stone-50 p-4 shadow-xl md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700">Live Candle</p>
            <h1 className="text-2xl font-black text-stone-950 md:text-3xl">실시간 주식 캔들 차트</h1>
            <p className="text-sm text-stone-500">보유 종목의 Yahoo Finance 시세를 서버 SSE로 받아 캔들 형태로 누적합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/stocks" className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-3 py-2 text-sm font-bold text-white">
              <ArrowLeft size={16} />
              자산 관리
            </a>
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-800"
            >
              <RefreshCw size={16} />
              새로고침
            </button>
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold ${
              streaming ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-600"
            }`}>
              <Activity size={16} />
              {streaming ? "Live" : "Offline"}
            </span>
          </div>
        </div>

        {error ? <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(220px,360px)_1fr]">
          <div className="rounded-2xl border border-stone-200 bg-white p-3">
            <label className="space-y-1">
              <span className="text-xs font-bold text-stone-500">차트 종목</span>
              <select
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-bold outline-none focus:border-emerald-500 focus:bg-white"
                value={selectedHolding?.symbol ?? ""}
                onChange={(event) => setSelectedSymbol(event.target.value)}
              >
                {holdings.map((holding) => (
                  <option key={holding.id} value={holding.symbol}>
                    {holding.symbol} · {holding.asset_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-3 sm:grid-cols-4">
            <div>
              <div className="text-xs font-bold text-stone-400">현재가</div>
              <div className="text-lg font-black">{formatMoney(selectedQuote?.price ?? 0, selectedHolding?.currency)}</div>
            </div>
            <div>
              <div className="text-xs font-bold text-stone-400">등락</div>
              <div className={`text-lg font-black ${(selectedQuote?.change ?? 0) >= 0 ? "text-red-600" : "text-blue-600"}`}>
                {selectedQuote ? `${formatMoney(selectedQuote.change, selectedHolding?.currency)} (${selectedQuote.change_rate.toFixed(2)}%)` : "-"}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-stone-400">거래량</div>
              <div className="text-lg font-black">{selectedQuote ? formatNumber(selectedQuote.volume, 0) : "-"}</div>
            </div>
            <div>
              <div className="text-xs font-bold text-stone-400">{periodLabel} 변동</div>
              <div className={`text-lg font-black ${periodChange >= 0 ? "text-red-600" : "text-blue-600"}`}>
                {selectedCandles.length > 1 ? `${formatMoney(periodChange, selectedHolding?.currency)} (${periodChangeRate.toFixed(2)}%)` : "-"}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap gap-2">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPeriod(option.value)}
                className={`inline-flex min-h-10 items-center justify-center rounded-full border px-3 text-sm font-black transition-colors ${
                  period === option.value
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="grid min-w-0 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-stone-50 px-3 py-2">
              <div className="text-xs font-bold text-stone-400">시작가</div>
              <div className="font-black">{baselineCandle ? formatMoney(baselineCandle.open, selectedHolding?.currency) : "-"}</div>
            </div>
            <div className="rounded-xl bg-stone-50 px-3 py-2">
              <div className="text-xs font-bold text-stone-400">이전 봉 대비</div>
              <div className={`font-black ${previousChange >= 0 ? "text-red-600" : "text-blue-600"}`}>
                {selectedCandles.length > 1 ? `${formatMoney(previousChange, selectedHolding?.currency)} (${previousChangeRate.toFixed(2)}%)` : "-"}
              </div>
            </div>
            <div className="rounded-xl bg-stone-50 px-3 py-2">
              <div className="text-xs font-bold text-stone-400">표시 데이터</div>
              <div className="font-black">{historyLoading ? "불러오는 중" : `${selectedCandles.length}개`}</div>
            </div>
          </div>
        </div>

        {loading || historyLoading ? (
          <div className="flex h-[360px] items-center justify-center rounded-2xl bg-white text-sm font-semibold text-stone-400">
            차트 데이터를 불러오는 중...
          </div>
        ) : holdings.length === 0 ? (
          <div className="flex h-[360px] items-center justify-center rounded-2xl bg-white text-sm font-semibold text-stone-400">
            자산 관리 화면에서 종목을 먼저 추가하세요.
          </div>
        ) : (
          <CandleChart candles={selectedCandles} currency={selectedHolding?.currency ?? "KRW"} period={period} />
        )}
      </section>
    </main>
  );
};

export default StockChart;
