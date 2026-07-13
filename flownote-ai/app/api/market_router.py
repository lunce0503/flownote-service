from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import yfinance as yf
from fastapi import APIRouter, Query
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix="/api/market", tags=["market"])


KRX_NAME_ALIASES = [
    ("005930.KS", "삼성전자", "KSC"),
    ("000660.KS", "SK하이닉스", "KSC"),
    ("005380.KS", "현대차", "KSC"),
    ("000270.KS", "기아", "KSC"),
    ("035420.KS", "NAVER", "KSC"),
    ("035720.KS", "카카오", "KSC"),
    ("373220.KS", "LG에너지솔루션", "KSC"),
    ("207940.KS", "삼성바이오로직스", "KSC"),
    ("068270.KS", "셀트리온", "KSC"),
    ("005490.KS", "POSCO홀딩스", "KSC"),
    ("105560.KS", "KB금융", "KSC"),
    ("055550.KS", "신한지주", "KSC"),
    ("012330.KS", "현대모비스", "KSC"),
    ("051910.KS", "LG화학", "KSC"),
    ("006400.KS", "삼성SDI", "KSC"),
    ("005935.KS", "삼성전자우", "KSC"),
]


class MarketSearchResult(BaseModel):
    symbol: str
    name: str
    exchange: str = ""
    market: str = ""
    quote_type: str = ""
    currency: str = "USD"


class MarketQuote(BaseModel):
    symbol: str
    asset_name: str
    market: str = ""
    price: float
    previous_close: float
    change: float
    change_rate: float
    volume: int = 0
    currency: str = "USD"
    timestamp: str


class MarketHistoryPoint(BaseModel):
    symbol: str
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: int = 0


HISTORY_INTERVALS = {
    "1d": "5m",
    "1wk": "30m",
    "1mo": "1d",
    "1y": "1wk",
    "5y": "1mo",
}


def _as_float(value: Any, fallback: float = 0.0) -> float:
    try:
        if value is None:
            return fallback
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _as_int(value: Any, fallback: int = 0) -> int:
    try:
        if value is None:
            return fallback
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _safe_fast_info(ticker: yf.Ticker) -> dict[str, Any]:
    try:
        fast_info = ticker.fast_info
        return dict(fast_info.items()) if hasattr(fast_info, "items") else dict(fast_info)
    except Exception:
        return {}


def _safe_info(ticker: yf.Ticker) -> dict[str, Any]:
    try:
        return ticker.info or {}
    except Exception:
        return {}


def _search_sync(query: str, limit: int) -> list[MarketSearchResult]:
    local_results = _search_local_aliases(query, limit)
    prefer_local = _should_prefer_local_aliases(query)
    results: list[MarketSearchResult] = local_results.copy() if prefer_local else []

    search = yf.Search(
        query,
        max_results=limit,
        news_count=0,
        lists_count=0,
        include_cb=False,
        include_nav_links=False,
        include_research=False,
        include_cultural_assets=False,
        recommended=0,
        raise_errors=False,
    )
    quotes = getattr(search, "quotes", None) or []
    existing_symbols = {result.symbol for result in results}

    for item in quotes[:limit]:
        symbol = str(item.get("symbol") or "").strip()
        if not symbol or symbol in existing_symbols:
            continue
        results.append(
            MarketSearchResult(
                symbol=symbol,
                name=str(item.get("shortname") or item.get("longname") or item.get("name") or symbol),
                exchange=str(item.get("exchange") or item.get("exchDisp") or ""),
                market=str(item.get("market") or item.get("exchange") or ""),
                quote_type=str(item.get("quoteType") or ""),
                currency=str(item.get("currency") or "USD"),
            )
        )
        existing_symbols.add(symbol)

    for result in local_results:
        if result.symbol not in existing_symbols:
            results.append(result)
            existing_symbols.add(result.symbol)
        if len(results) >= limit:
            break

    return results


def _should_prefer_local_aliases(query: str) -> bool:
    normalized = query.strip()
    if normalized.isdigit() and len(normalized) == 6:
        return True
    return any("가" <= char <= "힣" for char in normalized)


def _search_local_aliases(query: str, limit: int) -> list[MarketSearchResult]:
    normalized = query.strip().lower()
    if not normalized:
        return []

    results: list[MarketSearchResult] = []
    for symbol, name, exchange in KRX_NAME_ALIASES:
        symbol_key = symbol.lower()
        bare_code = symbol_key.split(".")[0]
        if normalized in name.lower() or normalized in symbol_key or normalized in bare_code:
            results.append(
                MarketSearchResult(
                    symbol=symbol,
                    name=name,
                    exchange=exchange,
                    market=exchange,
                    quote_type="EQUITY",
                    currency="KRW",
                )
            )
        if len(results) >= limit:
            break
    return results


def _quote_sync(symbol: str) -> MarketQuote | None:
    normalized = symbol.strip().upper()
    if not normalized:
        return None

    ticker = yf.Ticker(normalized)
    fast_info = _safe_fast_info(ticker)
    info: dict[str, Any] = {}

    price = _as_float(
        fast_info.get("last_price")
        or fast_info.get("lastPrice")
        or fast_info.get("regular_market_price")
    )
    previous_close = _as_float(
        fast_info.get("previous_close")
        or fast_info.get("previousClose")
        or fast_info.get("regular_market_previous_close"),
        price,
    )

    if price <= 0:
        info = _safe_info(ticker)
        price = _as_float(
            info.get("regularMarketPrice")
            or info.get("currentPrice")
            or info.get("previousClose")
        )
        previous_close = _as_float(info.get("regularMarketPreviousClose") or info.get("previousClose"), price)

    if price <= 0:
        return None

    if not info:
        info = _safe_info(ticker)

    change = price - previous_close
    change_rate = 0.0 if previous_close == 0 else (change / previous_close) * 100

    return MarketQuote(
        symbol=normalized,
        asset_name=str(info.get("shortName") or info.get("longName") or normalized),
        market=str(info.get("exchange") or info.get("fullExchangeName") or ""),
        price=round(price, 4),
        previous_close=round(previous_close, 4),
        change=round(change, 4),
        change_rate=round(change_rate, 4),
        volume=_as_int(fast_info.get("last_volume") or info.get("regularMarketVolume")),
        currency=str(fast_info.get("currency") or info.get("currency") or "USD"),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


def _quotes_sync(symbols: list[str]) -> list[MarketQuote]:
    quotes: list[MarketQuote] = []
    for symbol in symbols:
        quote = _quote_sync(symbol)
        if quote is not None:
            quotes.append(quote)
    return quotes


def _history_sync(symbol: str, period: str) -> list[MarketHistoryPoint]:
    normalized = symbol.strip().upper()
    normalized_period = period.strip().lower()
    interval = HISTORY_INTERVALS.get(normalized_period)
    if not normalized or interval is None:
        return []

    ticker = yf.Ticker(normalized)
    frame = ticker.history(period=normalized_period, interval=interval, auto_adjust=False)
    if frame is None or frame.empty:
        return []

    points: list[MarketHistoryPoint] = []
    for index, row in frame.tail(260).iterrows():
        open_price = _as_float(row.get("Open"))
        high_price = _as_float(row.get("High"), open_price)
        low_price = _as_float(row.get("Low"), open_price)
        close_price = _as_float(row.get("Close"), open_price)
        if close_price <= 0:
            continue
        timestamp = index.to_pydatetime()
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        points.append(
            MarketHistoryPoint(
                symbol=normalized,
                timestamp=timestamp.isoformat(),
                open=round(open_price or close_price, 4),
                high=round(max(high_price, open_price, close_price), 4),
                low=round(min(low_price or close_price, open_price or close_price, close_price), 4),
                close=round(close_price, 4),
                volume=_as_int(row.get("Volume")),
            )
        )
    return points


@router.get("/search", response_model=list[MarketSearchResult])
async def search_market(
    q: str = Query(..., min_length=1),
    limit: int = Query(8, ge=1, le=20),
) -> list[MarketSearchResult]:
    return await run_in_threadpool(_search_sync, q, limit)


@router.get("/quotes", response_model=list[MarketQuote])
async def market_quotes(symbols: str = Query(..., min_length=1)) -> list[MarketQuote]:
    parsed = [symbol.strip() for symbol in symbols.split(",") if symbol.strip()]
    return await run_in_threadpool(_quotes_sync, parsed[:30])


@router.get("/history", response_model=list[MarketHistoryPoint])
async def market_history(
    symbol: str = Query(..., min_length=1),
    period: str = Query("1mo", pattern="^(1d|1wk|1mo|1y|5y)$"),
) -> list[MarketHistoryPoint]:
    return await run_in_threadpool(_history_sync, symbol, period)
