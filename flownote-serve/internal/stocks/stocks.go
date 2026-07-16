package stocks

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/flownote/flownote-serve/internal/auth"
	"github.com/flownote/flownote-serve/internal/httpjson"
)

// Spring StockController/Service/Repository(/api/stocks) 이식.
// 시세는 STOCK_MARKET_DATA_URL(flownote-ai /api/market)을 중계하고, 실패 시 Spring과
// 동일한 규칙의 합성 시세로 폴백한다. 금액(NUMERIC)은 텍스트로 읽어 정밀도를 보존한다.

var numberPattern = regexp.MustCompile(`^-?\d+(\.\d+)?([eE][+-]?\d+)?$`)

// Num은 Postgres NUMERIC을 자릿수 손실 없이 JSON 숫자로 내보낸다.
type Num string

func (n Num) MarshalJSON() ([]byte, error) {
	s := string(n)
	if numberPattern.MatchString(s) {
		return []byte(s), nil
	}
	return []byte("0"), nil
}

func (n *Num) UnmarshalJSON(data []byte) error {
	s := strings.Trim(string(data), `"`)
	if s == "null" {
		*n = ""
		return nil
	}
	*n = Num(s)
	return nil
}

type Holding struct {
	ID           string    `json:"id"`
	Symbol       string    `json:"symbol"`
	AssetName    string    `json:"asset_name"`
	Market       string    `json:"market"`
	Quantity     Num       `json:"quantity"`
	AveragePrice Num       `json:"average_price"`
	Currency     string    `json:"currency"`
	Sector       string    `json:"sector"`
	Memo         string    `json:"memo"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type holdingRequest struct {
	Symbol       *string `json:"symbol"`
	AssetName    *string `json:"asset_name"`
	Market       *string `json:"market"`
	Quantity     *Num    `json:"quantity"`
	AveragePrice *Num    `json:"average_price"`
	Currency     *string `json:"currency"`
	Sector       *string `json:"sector"`
	Memo         *string `json:"memo"`
}

type CashBalance struct {
	Amount    Num       `json:"amount"`
	Currency  string    `json:"currency"`
	UpdatedAt time.Time `json:"updated_at"`
}

type cashRequest struct {
	Amount   *Num    `json:"amount"`
	Currency *string `json:"currency"`
}

type Repo struct {
	pool *pgxpool.Pool
}

func NewRepo(pool *pgxpool.Pool) *Repo { return &Repo{pool: pool} }

const holdingColumns = `id::text, symbol, asset_name, market, quantity::text, average_price::text, currency, sector, memo, created_at, updated_at`

func scanHolding(row pgx.Row) (Holding, error) {
	var h Holding
	var quantity, averagePrice string
	err := row.Scan(&h.ID, &h.Symbol, &h.AssetName, &h.Market, &quantity, &averagePrice,
		&h.Currency, &h.Sector, &h.Memo, &h.CreatedAt, &h.UpdatedAt)
	h.Quantity, h.AveragePrice = Num(quantity), Num(averagePrice)
	return h, err
}

func (r *Repo) FindAll(ctx context.Context, userID string) ([]Holding, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+holdingColumns+`
		FROM stock_holdings
		WHERE user_id = $1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	holdings := make([]Holding, 0)
	for rows.Next() {
		h, err := scanHolding(rows)
		if err != nil {
			return nil, err
		}
		holdings = append(holdings, h)
	}
	return holdings, rows.Err()
}

func text(v *string, fallback string) string {
	if v == nil || strings.TrimSpace(*v) == "" {
		return fallback
	}
	return strings.TrimSpace(*v)
}

func money(v *Num) string {
	if v == nil || strings.TrimSpace(string(*v)) == "" {
		return "0"
	}
	return string(*v)
}

func validateHolding(req holdingRequest) error {
	if text(req.Symbol, "") == "" {
		return httpjson.Errorf(http.StatusBadRequest, "종목 코드는 필수입니다.")
	}
	if q, err := strconv.ParseFloat(money(req.Quantity), 64); err != nil || q < 0 {
		return httpjson.Errorf(http.StatusBadRequest, "보유 수량은 0 이상이어야 합니다.")
	}
	if p, err := strconv.ParseFloat(money(req.AveragePrice), 64); err != nil || p < 0 {
		return httpjson.Errorf(http.StatusBadRequest, "평균 단가는 0 이상이어야 합니다.")
	}
	return nil
}

func (r *Repo) Create(ctx context.Context, userID string, req holdingRequest) (Holding, error) {
	symbol := strings.ToUpper(text(req.Symbol, ""))
	return scanHolding(r.pool.QueryRow(ctx, `
		INSERT INTO stock_holdings (user_id, symbol, asset_name, market, quantity, average_price, currency, sector, memo)
		VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7, $8, $9)
		RETURNING `+holdingColumns,
		userID, symbol, text(req.AssetName, symbol), text(req.Market, ""),
		money(req.Quantity), money(req.AveragePrice),
		strings.ToUpper(text(req.Currency, "KRW")), text(req.Sector, ""), text(req.Memo, "")))
}

func (r *Repo) Update(ctx context.Context, userID, id string, req holdingRequest) (Holding, bool, error) {
	symbol := strings.ToUpper(text(req.Symbol, ""))
	h, err := scanHolding(r.pool.QueryRow(ctx, `
		UPDATE stock_holdings
		SET symbol = $1, asset_name = $2, market = $3, quantity = $4::numeric,
		    average_price = $5::numeric, currency = $6, sector = $7, memo = $8, updated_at = NOW()
		WHERE id = $9 AND user_id = $10
		RETURNING `+holdingColumns,
		symbol, text(req.AssetName, symbol), text(req.Market, ""),
		money(req.Quantity), money(req.AveragePrice),
		strings.ToUpper(text(req.Currency, "KRW")), text(req.Sector, ""), text(req.Memo, ""),
		id, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Holding{}, false, nil
	}
	if err != nil {
		return Holding{}, false, err
	}
	return h, true, nil
}

func (r *Repo) Delete(ctx context.Context, userID, id string) (Holding, bool, error) {
	h, err := scanHolding(r.pool.QueryRow(ctx, `
		DELETE FROM stock_holdings
		WHERE id = $1 AND user_id = $2
		RETURNING `+holdingColumns, id, userID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Holding{}, false, nil
	}
	if err != nil {
		return Holding{}, false, err
	}
	return h, true, nil
}

func (r *Repo) FindCashBalance(ctx context.Context, userID string) (CashBalance, error) {
	var balance CashBalance
	var amount string
	err := r.pool.QueryRow(ctx, `
		SELECT amount::text, currency, updated_at
		FROM stock_cash_balances
		WHERE user_id = $1
	`, userID).Scan(&amount, &balance.Currency, &balance.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return CashBalance{Amount: "0", Currency: "KRW", UpdatedAt: time.Now()}, nil
	}
	if err != nil {
		return CashBalance{}, err
	}
	balance.Amount = Num(amount)
	return balance, nil
}

func (r *Repo) UpdateCashBalance(ctx context.Context, userID string, req cashRequest) (CashBalance, error) {
	var balance CashBalance
	var amount string
	err := r.pool.QueryRow(ctx, `
		INSERT INTO stock_cash_balances (user_id, amount, currency, updated_at)
		VALUES ($1, $2::numeric, $3, NOW())
		ON CONFLICT (user_id)
		DO UPDATE SET amount = EXCLUDED.amount, currency = EXCLUDED.currency, updated_at = NOW()
		RETURNING amount::text, currency, updated_at
	`, userID, money(req.Amount), strings.ToUpper(text(req.Currency, "KRW"))).
		Scan(&amount, &balance.Currency, &balance.UpdatedAt)
	if err != nil {
		return CashBalance{}, err
	}
	balance.Amount = Num(amount)
	return balance, nil
}

// ---- 시세(market) 중계 ----

type MarketClient struct {
	baseURL string
	client  *http.Client
}

func NewMarketClient(baseURL string) *MarketClient {
	return &MarketClient{baseURL: strings.TrimRight(baseURL, "/"), client: &http.Client{Timeout: 15 * time.Second}}
}

// fetchRaw는 업스트림 JSON 배열을 원문 그대로 가져온다(숫자 정밀도 보존).
func (c *MarketClient) fetchRaw(ctx context.Context, path string, params url.Values) ([]map[string]json.RawMessage, error) {
	if c.baseURL == "" {
		return nil, errors.New("market data url not configured")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path+"?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("market upstream status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	var items []map[string]json.RawMessage
	if err := json.Unmarshal(body, &items); err != nil {
		return nil, err
	}
	return items, nil
}

// ---- handler ----

type Handler struct {
	repo   *Repo
	market *MarketClient
	auth   *auth.Authenticator
}

func NewHandler(repo *Repo, market *MarketClient, authenticator *auth.Authenticator) *Handler {
	return &Handler{repo: repo, market: market, auth: authenticator}
}

func (h *Handler) Register(mux *http.ServeMux) {
	p := func(fn http.HandlerFunc) http.Handler { return h.auth.Middleware(fn) }
	mux.Handle("GET /api/stocks/holdings", p(h.listHoldings))
	mux.Handle("POST /api/stocks/holdings", p(h.createHolding))
	mux.Handle("PATCH /api/stocks/holdings/{id}", p(h.updateHolding))
	mux.Handle("DELETE /api/stocks/holdings/{id}", p(h.deleteHolding))
	mux.Handle("GET /api/stocks/quotes", p(h.quotes))
	mux.Handle("GET /api/stocks/search", p(h.search))
	mux.Handle("GET /api/stocks/history", p(h.history))
	mux.Handle("GET /api/stocks/cash", p(h.cash))
	mux.Handle("PATCH /api/stocks/cash", p(h.updateCash))
	// SSE는 쿼리 token으로 인증한다(Spring과 동일).
	mux.HandleFunc("GET /api/stocks/stream", h.stream)
}

func (h *Handler) listHoldings(w http.ResponseWriter, r *http.Request) {
	holdings, err := h.repo.FindAll(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, holdings)
}

func (h *Handler) createHolding(w http.ResponseWriter, r *http.Request) {
	var req holdingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "보유 자산 요청이 올바르지 않습니다."))
		return
	}
	if err := validateHolding(req); err != nil {
		httpjson.WriteError(w, err)
		return
	}
	created, err := h.repo.Create(r.Context(), auth.UserID(r.Context()), req)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	w.Header().Set("Location", "/api/stocks/holdings/"+created.ID)
	httpjson.Write(w, http.StatusCreated, created)
}

func (h *Handler) updateHolding(w http.ResponseWriter, r *http.Request) {
	var req holdingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "보유 자산 요청이 올바르지 않습니다."))
		return
	}
	if err := validateHolding(req); err != nil {
		httpjson.WriteError(w, err)
		return
	}
	updated, found, err := h.repo.Update(r.Context(), auth.UserID(r.Context()), r.PathValue("id"), req)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	if !found {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	httpjson.Write(w, http.StatusOK, map[string]any{
		"message":        "보유 자산이 수정되었습니다.",
		"updatedHolding": updated,
	})
}

func (h *Handler) deleteHolding(w http.ResponseWriter, r *http.Request) {
	deleted, found, err := h.repo.Delete(r.Context(), auth.UserID(r.Context()), r.PathValue("id"))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	if !found {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	httpjson.Write(w, http.StatusOK, map[string]any{
		"message":        "보유 자산이 삭제되었습니다.",
		"deletedHolding": deleted,
	})
}

func (h *Handler) quotes(w http.ResponseWriter, r *http.Request) {
	quotes, err := h.quotesFor(r.Context(), auth.UserID(r.Context()), time.Now().Unix())
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, quotes)
}

// quotesFor는 시세 중계를 시도하고, 실패하거나 누락된 종목은 합성 시세로 채운다(Spring과 동일).
func (h *Handler) quotesFor(ctx context.Context, userID string, tick int64) ([]map[string]json.RawMessage, error) {
	holdings, err := h.repo.FindAll(ctx, userID)
	if err != nil {
		return nil, err
	}
	if len(holdings) == 0 {
		return []map[string]json.RawMessage{}, nil
	}

	symbols := make([]string, 0, len(holdings))
	seen := map[string]bool{}
	for _, holding := range holdings {
		if !seen[holding.Symbol] {
			seen[holding.Symbol] = true
			symbols = append(symbols, holding.Symbol)
		}
	}

	upstream := map[string]map[string]json.RawMessage{}
	if items, err := h.market.fetchRaw(ctx, "/quotes", url.Values{"symbols": {strings.Join(symbols, ",")}}); err == nil {
		for _, item := range items {
			var symbol string
			if raw, ok := item["symbol"]; ok && json.Unmarshal(raw, &symbol) == nil {
				delete(item, "currency") // Spring StockQuote에는 currency가 없다.
				if _, ok := item["timestamp"]; !ok {
					ts, _ := json.Marshal(time.Now().UTC().Format(time.RFC3339))
					item["timestamp"] = ts
				}
				if _, dup := upstream[symbol]; !dup {
					upstream[symbol] = item
				}
			}
		}
	}

	quotes := make([]map[string]json.RawMessage, 0, len(holdings))
	for _, holding := range holdings {
		if quote, ok := upstream[holding.Symbol]; ok {
			quotes = append(quotes, quote)
			continue
		}
		quotes = append(quotes, syntheticQuote(holding, tick))
	}
	return quotes, nil
}

// syntheticQuote는 Spring StockService.quoteFor의 규칙(Java String.hashCode 기반)을 재현한다.
func syntheticQuote(h Holding, tick int64) map[string]json.RawMessage {
	averagePrice, _ := strconv.ParseFloat(string(h.AveragePrice), 64)
	if averagePrice <= 0 {
		averagePrice = 10000
	}
	hash := javaHashCode(h.Symbol)
	seed := float64(abs32(hash%1000)) / 1000.0
	wave := math.Sin(float64(tick)/3.0 + seed*math.Pi*2)
	microMove := math.Cos(float64(tick)/5.0+seed) * 0.004
	previousClose := averagePrice * (0.96 + seed*0.08)
	price := previousClose * (1 + wave*0.018 + microMove)
	change := price - previousClose
	changeRate := 0.0
	if previousClose != 0 {
		changeRate = change / previousClose * 100
	}
	volume := 50000 + abs64(int64(hash)*31+tick*7919)%900000

	round2 := func(v float64) json.RawMessage {
		return json.RawMessage(strconv.FormatFloat(math.Round(v*100)/100, 'f', 2, 64))
	}
	str := func(v string) json.RawMessage {
		b, _ := json.Marshal(v)
		return b
	}
	return map[string]json.RawMessage{
		"symbol":        str(h.Symbol),
		"asset_name":    str(h.AssetName),
		"market":        str(h.Market),
		"price":         round2(price),
		"previous_close": round2(previousClose),
		"change":        round2(change),
		"change_rate":   round2(changeRate),
		"volume":        json.RawMessage(strconv.FormatInt(volume, 10)),
		"timestamp":     str(time.Now().UTC().Format(time.RFC3339)),
	}
}

func javaHashCode(s string) int32 {
	var h int32
	for _, c := range s {
		h = 31*h + int32(c)
	}
	return h
}

func abs32(v int32) int32 {
	if v < 0 {
		return -v
	}
	return v
}

func abs64(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}

func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		httpjson.Write(w, http.StatusOK, []any{})
		return
	}
	items, err := h.market.fetchRaw(r.Context(), "/search", url.Values{"q": {query}, "limit": {"10"}})
	if err != nil {
		httpjson.Write(w, http.StatusOK, []any{})
		return
	}
	httpjson.Write(w, http.StatusOK, items)
}

func (h *Handler) history(w http.ResponseWriter, r *http.Request) {
	symbol := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("symbol")))
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "1mo"
	}
	if symbol == "" {
		httpjson.Write(w, http.StatusOK, []any{})
		return
	}

	holdings, err := h.repo.FindAll(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	owns := false
	for _, holding := range holdings {
		if strings.EqualFold(holding.Symbol, symbol) {
			owns = true
			break
		}
	}
	if !owns {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusNotFound, "보유 중인 종목이 아닙니다."))
		return
	}

	items, err := h.market.fetchRaw(r.Context(), "/history", url.Values{"symbol": {symbol}, "period": {period}})
	if err != nil {
		httpjson.Write(w, http.StatusOK, []any{})
		return
	}
	httpjson.Write(w, http.StatusOK, items)
}

func (h *Handler) cash(w http.ResponseWriter, r *http.Request) {
	balance, err := h.repo.FindCashBalance(r.Context(), auth.UserID(r.Context()))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, balance)
}

func (h *Handler) updateCash(w http.ResponseWriter, r *http.Request) {
	var req cashRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "현금 요청이 올바르지 않습니다."))
		return
	}
	if amount, err := strconv.ParseFloat(money(req.Amount), 64); err != nil || amount < 0 {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusBadRequest, "현금 금액은 0 이상이어야 합니다."))
		return
	}
	balance, err := h.repo.UpdateCashBalance(r.Context(), auth.UserID(r.Context()), req)
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	httpjson.Write(w, http.StatusOK, balance)
}

// stream은 5초 간격 SSE로 시세를 내보낸다(Spring SseEmitter와 동일한 event: quotes).
func (h *Handler) stream(w http.ResponseWriter, r *http.Request) {
	userID, err := h.auth.RequireUser(r.Context(), "Bearer "+r.URL.Query().Get("token"))
	if err != nil {
		httpjson.WriteError(w, err)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		httpjson.WriteError(w, httpjson.Errorf(http.StatusInternalServerError, "SSE를 지원하지 않는 환경입니다."))
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for tick := int64(0); tick < 3600; tick++ {
		quotes, err := h.quotesFor(r.Context(), userID, tick)
		if err != nil {
			return
		}
		data, err := json.Marshal(quotes)
		if err != nil {
			return
		}
		if _, err := fmt.Fprintf(w, "event: quotes\ndata: %s\n\n", data); err != nil {
			return
		}
		flusher.Flush()
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
		}
	}
}
