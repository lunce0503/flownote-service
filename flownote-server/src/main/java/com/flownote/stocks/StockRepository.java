package com.flownote.stocks;

import static com.flownote.stocks.StockDtos.StockHolding;
import static com.flownote.stocks.StockDtos.StockHoldingRequest;
import static com.flownote.stocks.StockDtos.StockCashBalance;
import static com.flownote.stocks.StockDtos.StockCashBalanceRequest;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class StockRepository {
    private final JdbcTemplate jdbcTemplate;

    private final RowMapper<StockHolding> holdingRowMapper = (rs, rowNum) -> new StockHolding(
            rs.getObject("id", UUID.class).toString(),
            rs.getString("symbol"),
            rs.getString("asset_name"),
            rs.getString("market"),
            rs.getBigDecimal("quantity"),
            rs.getBigDecimal("average_price"),
            rs.getString("currency"),
            rs.getString("sector"),
            rs.getString("memo"),
            rs.getTimestamp("created_at").toInstant(),
            rs.getTimestamp("updated_at").toInstant()
    );

    private final RowMapper<StockCashBalance> cashBalanceRowMapper = (rs, rowNum) -> new StockCashBalance(
            rs.getBigDecimal("amount"),
            rs.getString("currency"),
            rs.getTimestamp("updated_at").toInstant()
    );

    public StockRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<StockHolding> findAll(UUID userId) {
        return jdbcTemplate.query("""
                SELECT id, symbol, asset_name, market, quantity, average_price, currency, sector, memo, created_at, updated_at
                FROM stock_holdings
                WHERE user_id = ?
                ORDER BY created_at DESC
                """, holdingRowMapper, userId);
    }

    public StockHolding create(UUID userId, StockHoldingRequest request) {
        List<StockHolding> rows = jdbcTemplate.query(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO stock_holdings (
                        user_id, symbol, asset_name, market, quantity, average_price, currency, sector, memo
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    RETURNING id, symbol, asset_name, market, quantity, average_price, currency, sector, memo, created_at, updated_at
                    """);
            ps.setObject(1, userId);
            ps.setString(2, normalizeUpper(request.symbol()));
            ps.setString(3, normalizeText(request.assetName(), normalizeUpper(request.symbol())));
            ps.setString(4, normalizeText(request.market(), ""));
            ps.setBigDecimal(5, normalizeMoney(request.quantity()));
            ps.setBigDecimal(6, normalizeMoney(request.averagePrice()));
            ps.setString(7, normalizeText(request.currency(), "KRW").toUpperCase());
            ps.setString(8, normalizeText(request.sector(), ""));
            ps.setString(9, normalizeText(request.memo(), ""));
            return ps;
        }, holdingRowMapper);
        return rows.get(0);
    }

    public Optional<StockHolding> update(UUID userId, UUID holdingId, StockHoldingRequest request) {
        List<StockHolding> rows = jdbcTemplate.query(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    UPDATE stock_holdings
                    SET symbol = ?,
                        asset_name = ?,
                        market = ?,
                        quantity = ?,
                        average_price = ?,
                        currency = ?,
                        sector = ?,
                        memo = ?,
                        updated_at = NOW()
                    WHERE id = ? AND user_id = ?
                    RETURNING id, symbol, asset_name, market, quantity, average_price, currency, sector, memo, created_at, updated_at
                    """);
            ps.setString(1, normalizeUpper(request.symbol()));
            ps.setString(2, normalizeText(request.assetName(), normalizeUpper(request.symbol())));
            ps.setString(3, normalizeText(request.market(), ""));
            ps.setBigDecimal(4, normalizeMoney(request.quantity()));
            ps.setBigDecimal(5, normalizeMoney(request.averagePrice()));
            ps.setString(6, normalizeText(request.currency(), "KRW").toUpperCase());
            ps.setString(7, normalizeText(request.sector(), ""));
            ps.setString(8, normalizeText(request.memo(), ""));
            ps.setObject(9, holdingId);
            ps.setObject(10, userId);
            return ps;
        }, holdingRowMapper);
        return rows.stream().findFirst();
    }

    public Optional<StockHolding> delete(UUID userId, UUID holdingId) {
        List<StockHolding> rows = jdbcTemplate.query("""
                DELETE FROM stock_holdings
                WHERE id = ? AND user_id = ?
                RETURNING id, symbol, asset_name, market, quantity, average_price, currency, sector, memo, created_at, updated_at
                """, holdingRowMapper, holdingId, userId);
        return rows.stream().findFirst();
    }

    public StockCashBalance findCashBalance(UUID userId) {
        List<StockCashBalance> rows = jdbcTemplate.query("""
                SELECT amount, currency, updated_at
                FROM stock_cash_balances
                WHERE user_id = ?
                """, cashBalanceRowMapper, userId);
        return rows.stream()
                .findFirst()
                .orElseGet(() -> new StockCashBalance(BigDecimal.ZERO, "KRW", java.time.Instant.now()));
    }

    public StockCashBalance updateCashBalance(UUID userId, StockCashBalanceRequest request) {
        List<StockCashBalance> rows = jdbcTemplate.query(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO stock_cash_balances (user_id, amount, currency, updated_at)
                    VALUES (?, ?, ?, NOW())
                    ON CONFLICT (user_id)
                    DO UPDATE SET amount = EXCLUDED.amount,
                                  currency = EXCLUDED.currency,
                                  updated_at = NOW()
                    RETURNING amount, currency, updated_at
                    """);
            ps.setObject(1, userId);
            ps.setBigDecimal(2, normalizeMoney(request.amount()));
            ps.setString(3, normalizeText(request.currency(), "KRW").toUpperCase());
            return ps;
        }, cashBalanceRowMapper);
        return rows.get(0);
    }

    private static String normalizeText(String value, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value.trim();
    }

    private static String normalizeUpper(String value) {
        return normalizeText(value, "").toUpperCase();
    }

    private static BigDecimal normalizeMoney(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
