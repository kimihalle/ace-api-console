package model

import (
	"context"
	"errors"
	"math"
	"slices"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"gorm.io/gorm/clause"
)

const MaxUpstreamCostRatio = 1000000
const MaxProfitReportRows = 100000

var ErrProfitReportTooLarge = errors.New("profit report exceeds 100000 records; narrow the time range or filters")

func ValidateUpstreamCostRatio(ratio *float64) error {
	if ratio != nil && (math.IsNaN(*ratio) || math.IsInf(*ratio, 0) || *ratio < 0 || *ratio > MaxUpstreamCostRatio) {
		return common.NewMessage("upstream_cost_ratio must be between 0 and 1000000")
	}
	return nil
}

// ProfitSnapshot is private to administrators and immutable once the log is
// written. Cost is an estimate: both parties must use the same pricing baseline.
type ProfitSnapshot struct {
	Version       int      `json:"version"`
	Status        string   `json:"status"`
	PurchaseRatio *float64 `json:"purchase_ratio,omitempty"`
	SaleRatio     *float64 `json:"sale_ratio,omitempty"`
	Revenue       string   `json:"revenue"`
	Cost          string   `json:"cost,omitempty"`
	GrossProfit   string   `json:"gross_profit,omitempty"`
}

func CaptureProfitSnapshot(c *gin.Context, quota int, other *LogOther) {
	if other == nil {
		return
	}
	settings, _ := common.GetContextKeyType[dto.ChannelSettings](c, constant.ContextKeyChannelSetting)
	saleRatio, _ := other.public["group_ratio"].(float64)
	snapshot := NewProfitSnapshot(quota, settings.UpstreamCostRatio, saleRatio, common.QuotaPerUnit)
	if source, _ := other.public["billing_source"].(string); source == "subscription" {
		snapshot.Status = "subscription"
		snapshot.Cost, snapshot.GrossProfit = "", ""
	}
	if _, saturated := other.adminInfo["quota_saturation"]; saturated {
		snapshot.Status = "invalid_pricing"
		snapshot.Cost, snapshot.GrossProfit = "", ""
	}
	if isTask, _ := other.public["is_task"].(bool); isTask {
		snapshot.Status = "unsettled_task"
		snapshot.Cost, snapshot.GrossProfit = "", ""
	}
	other.SetAdmin("profit", snapshot)
}

func NewProfitSnapshot(quota int, purchaseRatio *float64, saleRatio, quotaPerUnit float64) ProfitSnapshot {
	snapshot := ProfitSnapshot{Version: 1, Status: "missing_cost_ratio", PurchaseRatio: purchaseRatio, SaleRatio: &saleRatio}
	if math.IsNaN(saleRatio) || math.IsInf(saleRatio, 0) {
		snapshot.SaleRatio = nil
	}
	if purchaseRatio != nil && (math.IsNaN(*purchaseRatio) || math.IsInf(*purchaseRatio, 0)) {
		snapshot.PurchaseRatio = nil
	}
	if quotaPerUnit <= 0 || math.IsNaN(quotaPerUnit) || math.IsInf(quotaPerUnit, 0) {
		snapshot.Status = "invalid_pricing"
		return snapshot
	}
	revenue := decimal.NewFromInt(int64(quota)).Div(decimal.NewFromFloat(quotaPerUnit))
	snapshot.Revenue = revenue.String()
	if purchaseRatio == nil {
		return snapshot
	}
	if ValidateUpstreamCostRatio(purchaseRatio) != nil || math.IsNaN(saleRatio) || math.IsInf(saleRatio, 0) || saleRatio < 0 || quota < 0 {
		snapshot.Status = "invalid_pricing"
		return snapshot
	}
	if *purchaseRatio > 0 && (saleRatio <= 0 || quota == 0) {
		snapshot.Status = "zero_sale_basis"
		return snapshot
	}
	cost := decimal.Zero
	if *purchaseRatio > 0 {
		cost = revenue.Mul(decimal.NewFromFloat(*purchaseRatio)).Div(decimal.NewFromFloat(saleRatio))
	}
	value, _ := cost.Float64()
	if math.IsInf(value, 0) || math.IsNaN(value) {
		snapshot.Status = "invalid_pricing"
		return snapshot
	}
	snapshot.Status, snapshot.Cost, snapshot.GrossProfit = "estimated", cost.String(), revenue.Sub(cost).String()
	return snapshot
}

type ProfitFilter struct {
	Start, End     int64
	ChannelID      int
	Model, Group   string
	Page, PageSize int
}

type ProfitTotals struct {
	Requests        int      `json:"requests"`
	KnownRequests   int      `json:"known_requests"`
	UnknownRequests int      `json:"unknown_requests"`
	Revenue         float64  `json:"revenue"`
	KnownRevenue    float64  `json:"known_revenue"`
	Cost            float64  `json:"cost"`
	GrossProfit     float64  `json:"gross_profit"`
	Margin          *float64 `json:"margin"`
}

type ProfitBreakdown struct {
	Key string `json:"key"`
	ProfitTotals
}

type ProfitRecord struct {
	RequestID     string   `json:"request_id"`
	CreatedAt     int64    `json:"created_at"`
	Username      string   `json:"username"`
	ChannelID     int      `json:"channel_id"`
	Model         string   `json:"model"`
	Group         string   `json:"group"`
	Status        string   `json:"status"`
	Revenue       float64  `json:"revenue"`
	PurchaseRatio *float64 `json:"purchase_ratio"`
	SaleRatio     *float64 `json:"sale_ratio"`
	Cost          *float64 `json:"cost"`
	GrossProfit   *float64 `json:"gross_profit"`
}

type ProfitReport struct {
	ExcludedRequests int               `json:"excluded_requests"`
	Totals           ProfitTotals      `json:"totals"`
	Daily            []ProfitBreakdown `json:"daily"`
	Channels         []ProfitBreakdown `json:"channels"`
	Groups           []ProfitBreakdown `json:"groups"`
	Records          []ProfitRecord    `json:"records"`
	Page             int               `json:"page"`
	PageSize         int               `json:"page_size"`
}

// ProfitOverviewState checkpoints derived totals in the primary database. Each
// refresh reads at most one bounded log batch; log retention does not erase totals
// already collected. Version provides optimistic locking across gateway nodes.
type ProfitOverviewState struct {
	Key           string `gorm:"primaryKey;size:64"`
	Cursor        int
	Version       int64
	ProcessedLogs int
	Data          string `gorm:"type:json"`
}

type profitOverviewDay struct {
	Requests     int             `json:"requests"`
	Known        int             `json:"known"`
	Excluded     int             `json:"excluded"`
	Revenue      decimal.Decimal `json:"revenue"`
	KnownRevenue decimal.Decimal `json:"known_revenue"`
	Cost         decimal.Decimal `json:"cost"`
}

type profitOverviewData struct {
	Days   map[string]profitOverviewDay `json:"days"`
	Recent []int                        `json:"recent"`
}

type ProfitPeriod struct {
	ProfitTotals
	ExcludedRequests int `json:"excluded_requests"`
}

type ProfitOverview struct {
	Today         ProfitPeriod `json:"today"`
	Yesterday     ProfitPeriod `json:"yesterday"`
	Month         ProfitPeriod `json:"month"`
	Lifetime      ProfitPeriod `json:"lifetime"`
	AsOf          int64        `json:"as_of"`
	Timezone      string       `json:"timezone"`
	Complete      bool         `json:"complete"`
	ProcessedLogs int          `json:"processed_logs"`
}

// profitRecordFromLog keeps overview and detail reports on the same accounting
// basis. Historical calls without procurement snapshots remain unknown.
func profitRecordFromLog(log Log) (ProfitRecord, decimal.Decimal, decimal.Decimal, bool, bool) {
	var metadata struct {
		BillingSource string `json:"billing_source"`
		IsTask        bool   `json:"is_task"`
		TaskID        string `json:"task_id"`
		Admin         struct {
			Profit       *ProfitSnapshot `json:"profit"`
			InternalTest bool            `json:"internal_test"`
		} `json:"admin_info"`
	}
	_ = common.UnmarshalJsonStr(log.Other, &metadata)
	if metadata.BillingSource == "subscription" || metadata.IsTask || metadata.TaskID != "" || metadata.Admin.InternalTest || (log.TokenId == 0 && log.TokenName == "Model test") {
		return ProfitRecord{}, decimal.Zero, decimal.Zero, false, true
	}
	snapshot := metadata.Admin.Profit
	revenue := decimal.NewFromInt(int64(log.Quota)).Div(decimal.NewFromFloat(common.QuotaPerUnit))
	record := ProfitRecord{RequestID: log.RequestId, CreatedAt: log.CreatedAt, Username: log.Username, ChannelID: log.ChannelId, Model: log.ModelName, Group: log.Group, Status: "missing_snapshot"}
	cost, known := decimal.Zero, false
	if snapshot != nil {
		record.Status, record.PurchaseRatio, record.SaleRatio = snapshot.Status, snapshot.PurchaseRatio, snapshot.SaleRatio
		storedRevenue, revenueErr := decimal.NewFromString(snapshot.Revenue)
		if revenueErr == nil {
			revenue = storedRevenue
		}
		storedCost, costErr := decimal.NewFromString(snapshot.Cost)
		if snapshot.Version == 1 && snapshot.Status == "estimated" && revenueErr == nil && costErr == nil && !storedCost.IsNegative() {
			cost, known = storedCost, true
			costValue, _ := cost.Float64()
			profitValue, _ := revenue.Sub(cost).Float64()
			record.Cost, record.GrossProfit = &costValue, &profitValue
		}
	}
	record.Revenue, _ = revenue.Float64()
	return record, revenue, cost, known, false
}

func QueryProfitOverview(ctx context.Context, now time.Time) (ProfitOverview, error) {
	const batchSize = 5000
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return ProfitOverview{}, err
	}
	now = now.In(location)
	key := "profit:v1:Asia/Shanghai"
	state := ProfitOverviewState{Key: key, Data: "{}"}
	if err := DB.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&state).Error; err != nil {
		return ProfitOverview{}, err
	}
	if err := DB.WithContext(ctx).Where(clause.Eq{Column: "key", Value: key}).First(&state).Error; err != nil {
		return ProfitOverview{}, err
	}
	stored := profitOverviewData{}
	if err := common.UnmarshalJsonStr(state.Data, &stored); err != nil {
		return ProfitOverview{}, err
	}
	if stored.Days == nil {
		stored.Days = map[string]profitOverviewDay{}
	}
	days := stored.Days
	seen := make(map[int]struct{}, len(stored.Recent))
	for _, id := range stored.Recent {
		seen[id] = struct{}{}
	}
	var logs []Log
	if err := LOG_DB.WithContext(ctx).Model(&Log{}).
		Select("id, created_at, quota, token_id, token_name, other").
		Where("type = ? AND id > ?", LogTypeConsume, state.Cursor).
		Order("id ASC").Limit(batchSize + 1).Find(&logs).Error; err != nil {
		return ProfitOverview{}, err
	}
	complete := len(logs) <= batchSize
	for _, log := range logs[:min(len(logs), batchSize)] {
		if err := ctx.Err(); err != nil {
			return ProfitOverview{}, err
		}
		if _, exists := seen[log.Id]; exists {
			continue
		}
		date := time.Unix(log.CreatedAt, 0).In(location).Format("2006-01-02")
		day := days[date]
		_, revenue, cost, known, excluded := profitRecordFromLog(log)
		if excluded {
			day.Excluded++
		} else {
			day.Requests++
			day.Revenue = day.Revenue.Add(revenue)
			if known {
				day.Known++
				day.KnownRevenue = day.KnownRevenue.Add(revenue)
				day.Cost = day.Cost.Add(cost)
			}
		}
		days[date] = day
		seen[log.Id] = struct{}{}
		stored.Recent = append(stored.Recent, log.Id)
		state.ProcessedLogs++
	}
	if len(logs) > 0 {
		// Replay an overlapping tail to collect nearby out-of-order commits.
		// IDs retained in the checkpoint prevent duplicate aggregation on replay.
		slices.Sort(stored.Recent)
		if len(stored.Recent) > 1000 {
			state.Cursor = stored.Recent[len(stored.Recent)-1001]
			stored.Recent = stored.Recent[len(stored.Recent)-1000:]
		}
		data, err := common.Marshal(stored)
		if err != nil {
			return ProfitOverview{}, err
		}
		updated := DB.WithContext(ctx).Model(&ProfitOverviewState{}).
			Where(clause.Eq{Column: "key", Value: key}).Where("version = ?", state.Version).
			Updates(map[string]any{"cursor": state.Cursor, "version": state.Version + 1, "processed_logs": state.ProcessedLogs, "data": string(data)})
		if updated.Error != nil {
			return ProfitOverview{}, updated.Error
		}
		if updated.RowsAffected != 1 {
			return ProfitOverview{}, errors.New("profit overview changed concurrently; retry")
		}
	}
	result := ProfitOverview{AsOf: now.Unix(), Timezone: location.String(), Complete: complete, ProcessedLogs: state.ProcessedLogs}
	today := now.Format("2006-01-02")
	yesterday := now.AddDate(0, 0, -1).Format("2006-01-02")
	month := now.Format("2006-01") + "-01"
	periods := []struct {
		start, end string
		value      *ProfitPeriod
		totals     profitAccumulator
	}{
		{today, today, &result.Today, profitAccumulator{}},
		{yesterday, yesterday, &result.Yesterday, profitAccumulator{}},
		{month, today, &result.Month, profitAccumulator{}},
		{"", today, &result.Lifetime, profitAccumulator{}},
	}
	for date, day := range days {
		for i := range periods {
			period := &periods[i]
			if date < period.start || date > period.end {
				continue
			}
			period.value.ExcludedRequests += day.Excluded
			period.totals.requests += day.Requests
			period.totals.known += day.Known
			period.totals.revenue = period.totals.revenue.Add(day.Revenue)
			period.totals.knownRevenue = period.totals.knownRevenue.Add(day.KnownRevenue)
			period.totals.cost = period.totals.cost.Add(day.Cost)
		}
	}
	for i := range periods {
		periods[i].value.ProfitTotals = periods[i].totals.totals()
	}
	return result, nil
}

type profitAccumulator struct {
	requests, known             int
	revenue, knownRevenue, cost decimal.Decimal
}

func (a *profitAccumulator) add(revenue, cost decimal.Decimal, known bool) {
	a.requests++
	a.revenue = a.revenue.Add(revenue)
	if known {
		a.known++
		a.knownRevenue = a.knownRevenue.Add(revenue)
		a.cost = a.cost.Add(cost)
	}
}

func (a profitAccumulator) totals() ProfitTotals {
	profit := a.knownRevenue.Sub(a.cost)
	result := ProfitTotals{Requests: a.requests, KnownRequests: a.known, UnknownRequests: a.requests - a.known}
	result.Revenue, _ = a.revenue.Float64()
	result.KnownRevenue, _ = a.knownRevenue.Float64()
	result.Cost, _ = a.cost.Float64()
	result.GrossProfit, _ = profit.Float64()
	if a.knownRevenue.IsPositive() {
		margin, _ := profit.Div(a.knownRevenue).Mul(decimal.NewFromInt(100)).Float64()
		result.Margin = &margin
	}
	return result
}

func profitBreakdowns(values map[string]*profitAccumulator) []ProfitBreakdown {
	result := make([]ProfitBreakdown, 0, len(values))
	for key, value := range values {
		result = append(result, ProfitBreakdown{Key: key, ProfitTotals: value.totals()})
	}
	slices.SortFunc(result, func(a, b ProfitBreakdown) int {
		if a.Key < b.Key {
			return -1
		}
		if a.Key > b.Key {
			return 1
		}
		return 0
	})
	return result
}

// QueryProfitReport parses scoped metadata in Go so separate SQLite, MySQL,
// PostgreSQL and ClickHouse log stores do not require dialect-specific JSON SQL.
func QueryProfitReport(ctx context.Context, filter ProfitFilter) (ProfitReport, error) {
	result := ProfitReport{Page: filter.Page, PageSize: filter.PageSize, Records: []ProfitRecord{}}
	if filter.Start <= 0 || filter.End <= filter.Start || filter.End-filter.Start > 31*86400 || filter.Page < 1 || filter.PageSize < 1 || filter.PageSize > 100 {
		return result, errors.New("invalid profit report filters")
	}
	query := LOG_DB.WithContext(ctx).Model(&Log{}).
		Select("created_at, username, channel_id, model_name, quota, request_id, token_id, token_name, other, "+logGroupCol).
		Where("type = ? AND created_at >= ? AND created_at < ?", LogTypeConsume, filter.Start, filter.End)
	if filter.ChannelID > 0 {
		query = query.Where("channel_id = ?", filter.ChannelID)
	}
	if filter.Model != "" {
		query = query.Where("model_name = ?", filter.Model)
	}
	if filter.Group != "" {
		query = query.Where(logGroupCol+" = ?", filter.Group)
	}
	rows, err := query.Order("created_at DESC, id DESC").Limit(MaxProfitReportRows + 1).Rows()
	if err != nil {
		return result, err
	}
	defer rows.Close()
	totals := &profitAccumulator{}
	daily, channels, groups := map[string]*profitAccumulator{}, map[string]*profitAccumulator{}, map[string]*profitAccumulator{}
	scanned := 0
	for rows.Next() {
		scanned++
		if scanned > MaxProfitReportRows {
			return ProfitReport{}, ErrProfitReportTooLarge
		}
		var log Log
		if err := LOG_DB.ScanRows(rows, &log); err != nil {
			return result, err
		}
		record, revenue, cost, known, excluded := profitRecordFromLog(log)
		if excluded {
			result.ExcludedRequests++
			continue
		}
		totals.add(revenue, cost, known)
		keys := []string{time.Unix(log.CreatedAt, 0).In(time.Local).Format("2006-01-02"), strconv.Itoa(log.ChannelId), log.Group}
		for i, values := range []map[string]*profitAccumulator{daily, channels, groups} {
			if values[keys[i]] == nil {
				values[keys[i]] = &profitAccumulator{}
			}
			values[keys[i]].add(revenue, cost, known)
		}
		if totals.requests > (filter.Page-1)*filter.PageSize && len(result.Records) < filter.PageSize {
			result.Records = append(result.Records, record)
		}
	}
	if err := rows.Err(); err != nil {
		return result, err
	}
	result.Totals, result.Daily, result.Channels, result.Groups = totals.totals(), profitBreakdowns(daily), profitBreakdowns(channels), profitBreakdowns(groups)
	return result, nil
}
