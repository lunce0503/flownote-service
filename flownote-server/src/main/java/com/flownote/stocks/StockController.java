package com.flownote.stocks;

import static com.flownote.stocks.StockDtos.StockHolding;
import static com.flownote.stocks.StockDtos.StockHoldingRequest;
import static com.flownote.stocks.StockDtos.StockHistoryPoint;
import static com.flownote.stocks.StockDtos.StockQuote;
import static com.flownote.stocks.StockDtos.StockSearchResult;
import static com.flownote.stocks.StockDtos.StockCashBalance;
import static com.flownote.stocks.StockDtos.StockCashBalanceRequest;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.flownote.auth.AuthService;

@RestController
@RequestMapping("/api/stocks")
public class StockController {
    private final AuthService authService;
    private final StockService stockService;

    public StockController(AuthService authService, StockService stockService) {
        this.authService = authService;
        this.stockService = stockService;
    }

    @GetMapping("/holdings")
    public List<StockHolding> findAll(@RequestHeader(value = "Authorization", required = false) String authorization) {
        UUID userId = authService.requireUserId(authorization);
        return stockService.findAll(userId);
    }

    @PostMapping("/holdings")
    public ResponseEntity<StockHolding> create(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody StockHoldingRequest request) {
        UUID userId = authService.requireUserId(authorization);
        StockHolding created = stockService.create(userId, request);
        return ResponseEntity.created(URI.create("/api/stocks/holdings/" + created.id())).body(created);
    }

    @PatchMapping("/holdings/{id}")
    public ResponseEntity<?> update(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String id,
            @RequestBody StockHoldingRequest request) {
        UUID userId = authService.requireUserId(authorization);
        return stockService.update(userId, id, request)
                .<ResponseEntity<?>>map(holding -> ResponseEntity.ok(Map.of(
                        "message", "보유 자산이 수정되었습니다.",
                        "updatedHolding", holding
                )))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/holdings/{id}")
    public ResponseEntity<?> delete(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String id) {
        UUID userId = authService.requireUserId(authorization);
        return stockService.delete(userId, id)
                .<ResponseEntity<?>>map(holding -> ResponseEntity.ok(Map.of(
                        "message", "보유 자산이 삭제되었습니다.",
                        "deletedHolding", holding
                )))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/quotes")
    public List<StockQuote> quotes(@RequestHeader(value = "Authorization", required = false) String authorization) {
        UUID userId = authService.requireUserId(authorization);
        return stockService.quotes(userId, System.currentTimeMillis() / 1000L);
    }

    @GetMapping("/search")
    public List<StockSearchResult> search(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam("q") String query) {
        authService.requireUserId(authorization);
        return stockService.search(query);
    }

    @GetMapping("/history")
    public List<StockHistoryPoint> history(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam("symbol") String symbol,
            @RequestParam(value = "period", defaultValue = "1mo") String period) {
        UUID userId = authService.requireUserId(authorization);
        return stockService.history(userId, symbol, period);
    }

    @GetMapping("/cash")
    public StockCashBalance cashBalance(@RequestHeader(value = "Authorization", required = false) String authorization) {
        UUID userId = authService.requireUserId(authorization);
        return stockService.findCashBalance(userId);
    }

    @PatchMapping("/cash")
    public StockCashBalance updateCashBalance(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody StockCashBalanceRequest request) {
        UUID userId = authService.requireUserId(authorization);
        return stockService.updateCashBalance(userId, request);
    }

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@RequestParam("token") String token) {
        UUID userId = authService.requireUserId("Bearer " + token);
        SseEmitter emitter = new SseEmitter(0L);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        executor.execute(() -> {
            try {
                for (long tick = 0; tick < 3600; tick += 1) {
                    emitter.send(SseEmitter.event()
                            .name("quotes")
                            .data(stockService.quotes(userId, tick)));
                    Thread.sleep(5000L);
                }
                emitter.complete();
            } catch (IOException exception) {
                emitter.completeWithError(exception);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                emitter.complete();
            } finally {
                executor.shutdown();
            }
        });
        emitter.onCompletion(executor::shutdownNow);
        emitter.onTimeout(executor::shutdownNow);
        emitter.onError(error -> executor.shutdownNow());
        return emitter;
    }
}
