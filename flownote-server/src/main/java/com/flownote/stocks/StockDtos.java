package com.flownote.stocks;

import java.math.BigDecimal;
import java.time.Instant;

public final class StockDtos {
    private StockDtos() {
    }

    public record StockHolding(
            String id,
            String symbol,
            String assetName,
            String market,
            BigDecimal quantity,
            BigDecimal averagePrice,
            String currency,
            String sector,
            String memo,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record StockHoldingRequest(
            String symbol,
            String assetName,
            String market,
            BigDecimal quantity,
            BigDecimal averagePrice,
            String currency,
            String sector,
            String memo
    ) {
    }

    public record StockQuote(
            String symbol,
            String assetName,
            String market,
            BigDecimal price,
            BigDecimal previousClose,
            BigDecimal change,
            BigDecimal changeRate,
            long volume,
            Instant timestamp
    ) {
    }

    public record StockSearchResult(
            String symbol,
            String name,
            String exchange,
            String market,
            String quoteType,
            String currency
    ) {
    }

    public record StockHistoryPoint(
            String symbol,
            Instant timestamp,
            BigDecimal open,
            BigDecimal high,
            BigDecimal low,
            BigDecimal close,
            long volume
    ) {
    }

    public record StockCashBalance(
            BigDecimal amount,
            String currency,
            Instant updatedAt
    ) {
    }

    public record StockCashBalanceRequest(
            BigDecimal amount,
            String currency
    ) {
    }
}
