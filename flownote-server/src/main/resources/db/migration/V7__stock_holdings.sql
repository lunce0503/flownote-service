CREATE TABLE IF NOT EXISTS stock_holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    asset_name TEXT NOT NULL,
    market TEXT NOT NULL DEFAULT '',
    quantity NUMERIC(20, 6) NOT NULL DEFAULT 0,
    average_price NUMERIC(20, 4) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'KRW',
    sector TEXT NOT NULL DEFAULT '',
    memo TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_holdings_user_symbol ON stock_holdings(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_stock_holdings_user_created ON stock_holdings(user_id, created_at DESC);
