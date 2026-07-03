package com.flownote.canvas;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.FutureTask;
import java.util.concurrent.PriorityBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import jakarta.annotation.PreDestroy;

@Service
public class CanvasOperationScheduler {
    private static final int GLOBAL_LIMIT = 200;
    private static final int USER_LIMIT = 20;
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(
            4, 4, 0, TimeUnit.MILLISECONDS, new PriorityBlockingQueue<>());
    private final AtomicLong sequence = new AtomicLong();
    private final AtomicInteger activeAndQueued = new AtomicInteger();
    private final Map<UUID, AtomicInteger> perUser = new ConcurrentHashMap<>();
    private final CanvasDiagnosticsService diagnosticsService;

    public CanvasOperationScheduler(CanvasDiagnosticsService diagnosticsService) {
        this.diagnosticsService = diagnosticsService;
    }

    public <T> T execute(UUID userId, UUID canvasId, UUID mutationId, String operationType,
            String trigger, Long payloadBytes, Callable<T> callable) {
        int priority = CanvasOperationPriority.resolve(operationType, trigger);
        String normalizedTrigger = CanvasOperationPriority.normalizeTrigger(trigger);
        UUID requestId = UUID.randomUUID();
        AtomicInteger userCount = perUser.computeIfAbsent(userId, ignored -> new AtomicInteger());
        if (activeAndQueued.incrementAndGet() > GLOBAL_LIMIT || userCount.incrementAndGet() > USER_LIMIT) {
            activeAndQueued.decrementAndGet();
            userCount.decrementAndGet();
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "캔버스 요청 큐가 가득 찼습니다. 잠시 후 다시 시도하세요.");
        }

        long enqueuedAt = System.nanoTime();
        Runnable release = () -> {
            activeAndQueued.decrementAndGet();
            if (userCount.decrementAndGet() == 0) perUser.remove(userId, userCount);
        };
        PriorityTask<T> task = new PriorityTask<>(priority, sequence.incrementAndGet(), () -> {
            long queueMs = elapsedMs(enqueuedAt);
            long startedAt = System.nanoTime();
            try {
                T value = callable.call();
                diagnosticsService.record(requestId, mutationId, userId, canvasId, operationType,
                        normalizedTrigger, priority, "SUCCEEDED", null, queueMs, elapsedMs(startedAt), payloadBytes);
                return value;
            } catch (Exception exception) {
                diagnosticsService.record(requestId, mutationId, userId, canvasId, operationType,
                        normalizedTrigger, priority, "FAILED", exception.getClass().getSimpleName(),
                        queueMs, elapsedMs(startedAt), payloadBytes);
                throw exception;
            }
        }, release);
        try {
            executor.execute(task);
        } catch (RuntimeException exception) {
            release.run();
            throw exception;
        }
        try {
            return task.get(35, TimeUnit.SECONDS);
        } catch (TimeoutException exception) {
            task.cancel(true);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "캔버스 요청 처리 시간이 초과되었습니다.", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "캔버스 요청 처리가 중단되었습니다.", exception);
        } catch (java.util.concurrent.ExecutionException exception) {
            Throwable cause = exception.getCause();
            if (cause instanceof RuntimeException runtimeException) throw runtimeException;
            throw new IllegalStateException("캔버스 요청 처리에 실패했습니다.", cause);
        }
    }

    public Map<String, Integer> stats() {
        return Map.of("active", executor.getActiveCount(), "queued", executor.getQueue().size(),
                "capacity", GLOBAL_LIMIT, "workers", executor.getCorePoolSize());
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
    }

    private long elapsedMs(long startedAt) {
        return (System.nanoTime() - startedAt) / 1_000_000;
    }

    private static final class PriorityTask<T> extends FutureTask<T> implements Comparable<PriorityTask<?>> {
        private final int priority;
        private final long sequence;
        private final Runnable release;

        private PriorityTask(int priority, long sequence, Callable<T> callable, Runnable release) {
            super(callable);
            this.priority = priority;
            this.sequence = sequence;
            this.release = release;
        }

        @Override
        public int compareTo(PriorityTask<?> other) {
            int byPriority = Integer.compare(other.priority, priority);
            return byPriority != 0 ? byPriority : Long.compare(sequence, other.sequence);
        }

        @Override
        protected void done() {
            release.run();
        }
    }
}
