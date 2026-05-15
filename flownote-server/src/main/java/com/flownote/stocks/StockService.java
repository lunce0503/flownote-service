package com.flownote.stocks;

import static com.flownote.stocks.StockDtos.StockHolding;
import static com.flownote.stocks.StockDtos.StockHoldingRequest;
import static com.flownote.stocks.StockDtos.StockHistoryPoint;
import static com.flownote.stocks.StockDtos.StockQuote;
import static com.flownote.stocks.StockDtos.StockSearchResult;
import static com.flownote.stocks.StockDtos.StockCashBalance;
import static com.flownote.stocks.StockDtos.StockCashBalanceRequest;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
public class StockService {
    private final StockRepository stockRepository;
    private final YahooFinanceClient yahooFinanceClient;

    public StockService(StockRepository stockRepository, YahooFinanceClient yahooFinanceClient) {
        this.stockRepository = stockRepository;
        this.yahooFinanceClient = yahooFinanceClient;
    }

    public List<StockHolding> findAll(UUID userId) {
        return stockRepository.findAll(userId);
    }

    public StockHolding create(UUID userId, StockHoldingRequest request) {
        validate(request);
        return stockRepository.create(userId, request);
    }

    public Optional<StockHolding> update(UUID userId, String holdingId, StockHoldingRequest request) {
        validate(request);
        return stockRepository.update(userId, UUID.fromString(holdingId), request);
    }

    public Optional<StockHolding> delete(UUID userId, String holdingId) {
        return stockRepository.delete(userId, UUID.fromString(holdingId));
    }

    public List<StockQuote> quotes(UUID userId, long tick) {
        List<StockHolding> holdings = findAll(userId);
        if (holdings.isEmpty()) {
            return List.of();
        }

        try {
            Map<String, StockQuote> yahooQuotes = yahooFinanceClient.quotes(holdings).stream()
                    .collect(Collectors.toMap(StockQuote::symbol, quote -> quote, (left, right) -> left));

            return holdings.stream()
                    .map(holding -> yahooQuotes.getOrDefault(holding.symbol(), quoteFor(holding, tick)))
                    .toList();
        } catch (RuntimeException exception) {
            return holdings.stream()
                    .map(holding -> quoteFor(holding, tick))
                    .toList();
        }
    }

    public List<StockSearchResult> search(String query) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        try {
            return yahooFinanceClient.search(query.trim());
        } catch (RuntimeException exception) {
            return List.of();
        }
    }

    public List<StockHistoryPoint> history(UUID userId, String symbol, String period) {
        String normalizedSymbol = symbol == null ? "" : symbol.trim().toUpperCase();
        if (normalizedSymbol.isBlank()) {
            return List.of();
        }

        boolean ownsSymbol = findAll(userId).stream()
                .anyMatch(holding -> holding.symbol().equalsIgnoreCase(normalizedSymbol));
        if (!ownsSymbol) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "보유 중인 종목이 아닙니다.");
        }

        try {
            return yahooFinanceClient.history(normalizedSymbol, period);
        } catch (RuntimeException exception) {
            return List.of();
        }
    }

    public StockCashBalance findCashBalance(UUID userId) {
        return stockRepository.findCashBalance(userId);
    }

    public StockCashBalance updateCashBalance(UUID userId, StockCashBalanceRequest request) {
        if (request == null || request.amount() == null || request.amount().compareTo(BigDecimal.ZERO) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "현금 금액은 0 이상이어야 합니다.");
        }
        return stockRepository.updateCashBalance(userId, request);
    }

    private StockQuote quoteFor(StockHolding holding, long tick) {
        BigDecimal averagePrice = holding.averagePrice().compareTo(BigDecimal.ZERO) > 0
                ? holding.averagePrice()
                : BigDecimal.valueOf(10000);
        double seed = Math.abs(holding.symbol().hashCode() % 1000) / 1000.0;
        double wave = Math.sin((tick / 3.0) + seed * Math.PI * 2);
        double microMove = Math.cos((tick / 5.0) + seed) * 0.004;
        BigDecimal previousClose = averagePrice.multiply(BigDecimal.valueOf(0.96 + seed * 0.08));
        BigDecimal price = previousClose.multiply(BigDecimal.valueOf(1 + wave * 0.018 + microMove));
        BigDecimal change = price.subtract(previousClose);
        BigDecimal changeRate = previousClose.compareTo(BigDecimal.ZERO) == 0
                ? BigDecimal.ZERO
                : change.divide(previousClose, 6, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100));
        long volume = 50_000L + Math.abs((long) holding.symbol().hashCode() * 31L + tick * 7919L) % 900_000L;

        return new StockQuote(
                holding.symbol(),
                holding.assetName(),
                holding.market(),
                price.setScale(2, RoundingMode.HALF_UP),
                previousClose.setScale(2, RoundingMode.HALF_UP),
                change.setScale(2, RoundingMode.HALF_UP),
                changeRate.setScale(2, RoundingMode.HALF_UP),
                volume,
                Instant.now()
        );
    }

    private void validate(StockHoldingRequest request) {
        if (request == null || request.symbol() == null || request.symbol().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "종목 코드는 필수입니다.");
        }
        if (request.quantity() == null || request.quantity().compareTo(BigDecimal.ZERO) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "보유 수량은 0 이상이어야 합니다.");
        }
        if (request.averagePrice() == null || request.averagePrice().compareTo(BigDecimal.ZERO) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "평균 단가는 0 이상이어야 합니다.");
        }
    }
}
