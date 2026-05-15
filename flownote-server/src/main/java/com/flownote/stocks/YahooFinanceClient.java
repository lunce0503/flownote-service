package com.flownote.stocks;

import static com.flownote.stocks.StockDtos.StockHolding;
import static com.flownote.stocks.StockDtos.StockHistoryPoint;
import static com.flownote.stocks.StockDtos.StockQuote;
import static com.flownote.stocks.StockDtos.StockSearchResult;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class YahooFinanceClient {
    private final RestClient restClient;
    private final String marketDataUrl;

    public YahooFinanceClient(RestClient.Builder restClientBuilder,
                              @Value("${flownote.stocks.market-data-url}") String marketDataUrl) {
        this.restClient = restClientBuilder.build();
        this.marketDataUrl = marketDataUrl.replaceAll("/$", "");
    }

    public List<StockSearchResult> search(String query) {
        URI uri = UriComponentsBuilder.fromHttpUrl(marketDataUrl)
                .path("/search")
                .queryParam("q", query)
                .queryParam("limit", 10)
                .encode()
                .build()
                .toUri();
        StockSearchResult[] results = restClient.get().uri(uri).retrieve().body(StockSearchResult[].class);
        return results == null ? List.of() : Arrays.asList(results);
    }

    public List<StockQuote> quotes(List<StockHolding> holdings) {
        String symbols = holdings.stream()
                .map(StockHolding::symbol)
                .distinct()
                .reduce((left, right) -> left + "," + right)
                .orElse("");
        if (symbols.isBlank()) {
            return List.of();
        }

        URI uri = UriComponentsBuilder.fromHttpUrl(marketDataUrl)
                .path("/quotes")
                .queryParam("symbols", symbols)
                .encode()
                .build()
                .toUri();
        YahooQuote[] quotes = restClient.get().uri(uri).retrieve().body(YahooQuote[].class);
        if (quotes == null) {
            return List.of();
        }
        return Arrays.stream(quotes).map(YahooQuote::toStockQuote).toList();
    }

    public List<StockHistoryPoint> history(String symbol, String period) {
        URI uri = UriComponentsBuilder.fromHttpUrl(marketDataUrl)
                .path("/history")
                .queryParam("symbol", symbol)
                .queryParam("period", period)
                .encode()
                .build()
                .toUri();
        StockHistoryPoint[] points = restClient.get().uri(uri).retrieve().body(StockHistoryPoint[].class);
        return points == null ? List.of() : Arrays.asList(points);
    }

    private record YahooQuote(
            String symbol,
            String assetName,
            String market,
            BigDecimal price,
            BigDecimal previousClose,
            BigDecimal change,
            BigDecimal changeRate,
            long volume,
            String currency,
            Instant timestamp
    ) {
        StockQuote toStockQuote() {
            return new StockQuote(
                    symbol,
                    assetName,
                    market,
                    price,
                    previousClose,
                    change,
                    changeRate,
                    volume,
                    timestamp == null ? Instant.now() : timestamp
            );
        }
    }
}
