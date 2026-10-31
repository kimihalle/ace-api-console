package model

import (
	"context"
	"math"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestProfitSnapshots(t *testing.T) {
	for _, tc := range []struct {
		name                             string
		cost                             *float64
		sale                             float64
		quota                            int
		status, revenue, expense, profit string
	}{
		{"ratio spread", common.GetPointer(0.3), 0.5, 250000, "estimated", "0.5", "0.3", "0.2"},
		{"special effective ratio", common.GetPointer(0.3), 0.4, 200000, "estimated", "0.4", "0.3", "0.1"},
		{"loss", common.GetPointer(0.6), 0.5, 250000, "estimated", "0.5", "0.6", "-0.1"},
		{"unknown is not free", nil, 0.5, 250000, "missing_cost_ratio", "0.5", "", ""},
		{"explicit free", common.GetPointer(0.0), 0.5, 250000, "estimated", "0.5", "0", "0.5"},
		{"free sales has no inverse basis", common.GetPointer(0.3), 0, 0, "zero_sale_basis", "0", "", ""},
		{"rounded zero has unknown cost", common.GetPointer(0.3), 0.5, 0, "zero_sale_basis", "0", "", ""},
		{"invalid ratio", common.GetPointer(math.Inf(1)), 0.5, 250000, "invalid_pricing", "0.5", "", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			snapshot := NewProfitSnapshot(tc.quota, tc.cost, tc.sale, 500000)
			assert.Equal(t, tc.status, snapshot.Status)
			assert.Equal(t, tc.revenue, snapshot.Revenue)
			assert.Equal(t, tc.expense, snapshot.Cost)
			assert.Equal(t, tc.profit, snapshot.GrossProfit)
			_, err := common.Marshal(snapshot)
			require.NoError(t, err)
		})
	}
	require.NoError(t, ValidateUpstreamCostRatio(nil))
	require.NoError(t, ValidateUpstreamCostRatio(common.GetPointer(0.0)))
	for _, invalid := range []float64{-1, math.NaN(), math.Inf(1), MaxUpstreamCostRatio + 1} {
		require.Error(t, ValidateUpstreamCostRatio(&invalid))
	}
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	common.SetContextKey(ctx, constant.ContextKeyChannelSetting, dto.ChannelSettings{UpstreamCostRatio: common.GetPointer(0.3)})
	other := NewLogOther()
	other.SetPublic("group_ratio", 0.5)
	CaptureProfitSnapshot(ctx, 250000, other)
	stored := other.JSONString()
	assert.Contains(t, stored, `"cost":"0.3"`)
	assert.NotContains(t, formatLogOtherJSON(stored, logOtherVisibilityUser), "purchase_ratio")
	assert.Contains(t, formatLogOtherJSON(stored, logOtherVisibilityAdmin), "purchase_ratio")
	other.SetPublic("billing_source", "subscription")
	CaptureProfitSnapshot(ctx, 250000, other)
	assert.Contains(t, other.JSONString(), `"status":"subscription"`)
	assert.NotContains(t, other.JSONString(), `"gross_profit"`)
}

func TestProfitReportPersistence(t *testing.T) {
	var dialect gorm.Dialector = sqlite.Open(filepath.Join(t.TempDir(), "profit.db"))
	switch os.Getenv("PROFIT_TEST_DIALECT") {
	case "mysql":
		dialect = mysql.Open(os.Getenv("PROFIT_TEST_DSN"))
	case "postgres":
		dialect = postgres.Open(os.Getenv("PROFIT_TEST_DSN"))
	}
	db, err := gorm.Open(dialect, &gorm.Config{})
	require.NoError(t, err)
	query := "SELECT sqlite_version()"
	if dialect.Name() != "sqlite" {
		query = "SELECT version()"
	}
	var version string
	require.NoError(t, db.Raw(query).Scan(&version).Error)
	t.Logf("database=%s version=%s", dialect.Name(), version)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	previous := LOG_DB
	previousLogType := common.LogDatabaseType()
	common.SetLogDatabaseType(common.DatabaseType(dialect.Name()))
	initCol()
	LOG_DB = db
	t.Cleanup(func() {
		LOG_DB = previous
		common.SetLogDatabaseType(previousLogType)
		initCol()
	})
	for range 2 {
		require.NoError(t, db.AutoMigrate(&Log{}))
	}
	snapshot := NewProfitSnapshot(250000, common.GetPointer(0.3), 0.5, common.QuotaPerUnit)
	other := NewLogOther()
	other.SetAdmin("profit", snapshot)
	for _, log := range []Log{
		{Type: LogTypeConsume, CreatedAt: 1800000100, RequestId: "known", ChannelId: 4, Group: "retail", ModelName: "model-a", Quota: 250000, Other: other.JSONString()},
		{Type: LogTypeConsume, CreatedAt: 1800000200, RequestId: "old", ChannelId: 5, Group: "retail", ModelName: "model-a", Quota: 500000, Other: "{}"},
		{Type: LogTypeError, CreatedAt: 1800000300, RequestId: "error", Quota: 0},
		{Type: LogTypeConsume, CreatedAt: 1800000300, RequestId: "probe", TokenName: "Model test", Quota: 99999},
		{Type: LogTypeConsume, CreatedAt: 1800000300, RequestId: "task-precharge", Quota: 99999, Other: `{"is_task":true}`},
		{Type: LogTypeConsume, CreatedAt: 1800000300, RequestId: "subscription", Quota: 99999, Other: `{"billing_source":"subscription"}`},
		{Type: LogTypeConsume, CreatedAt: 1800100000, RequestId: "outside", Quota: 100000},
	} {
		require.NoError(t, db.Create(&log).Error)
	}
	filter := ProfitFilter{Start: 1800000000, End: 1800000400, Page: 1, PageSize: 1}
	result, err := QueryProfitReport(context.Background(), filter)
	require.NoError(t, err)
	assert.Equal(t, 2, result.Totals.Requests)
	assert.Equal(t, 3, result.ExcludedRequests)
	assert.Equal(t, 1, result.Totals.UnknownRequests)
	assert.InDelta(t, 1.5, result.Totals.Revenue, 1e-10)
	assert.InDelta(t, 0.5, result.Totals.KnownRevenue, 1e-10)
	assert.InDelta(t, 0.3, result.Totals.Cost, 1e-10)
	assert.InDelta(t, 0.2, result.Totals.GrossProfit, 1e-10)
	require.NotNil(t, result.Totals.Margin)
	assert.InDelta(t, 40, *result.Totals.Margin, 1e-8)
	require.Len(t, result.Records, 1)
	assert.Equal(t, "old", result.Records[0].RequestID)
	assert.Nil(t, result.Records[0].Cost)
	filter.Page = 2
	result, err = QueryProfitReport(context.Background(), filter)
	require.NoError(t, err)
	require.Len(t, result.Records, 1)
	assert.Equal(t, "known", result.Records[0].RequestID)
	// Later purchase or sales configuration is never consulted for past logs.
	filter.ChannelID = 4
	filter.Page = 1
	result, err = QueryProfitReport(context.Background(), filter)
	require.NoError(t, err)
	assert.InDelta(t, 0.2, result.Totals.GrossProfit, 1e-10)
	filter.Model = "missing"
	result, err = QueryProfitReport(context.Background(), filter)
	require.NoError(t, err)
	assert.Zero(t, result.Totals.Requests)
	assert.Nil(t, result.Totals.Margin)
	filter.End = filter.Start + 32*86400
	_, err = QueryProfitReport(context.Background(), filter)
	require.Error(t, err)

	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })
	// Upgrade a database that already has consumption logs, then migrate again.
	for range 2 {
		require.NoError(t, db.AutoMigrate(&ProfitOverviewState{}))
	}
	var logCount int64
	require.NoError(t, db.Model(&Log{}).Count(&logCount).Error)
	assert.EqualValues(t, 7, logCount)
	location, err := time.LoadLocation("Asia/Shanghai")
	require.NoError(t, err)
	now := time.Date(2030, 3, 1, 0, 30, 0, 0, location)
	initial, err := QueryProfitOverview(context.Background(), now)
	require.NoError(t, err)
	assert.True(t, initial.Complete)
	assert.Equal(t, 3, initial.Lifetime.Requests)
	assert.Equal(t, 3, initial.Lifetime.ExcludedRequests)
	assert.Equal(t, 2, initial.Lifetime.UnknownRequests)
	assert.Zero(t, initial.Today.Requests)
	assert.InDelta(t, 0.2, initial.Lifetime.GrossProfit, 1e-10)
	// UTC is still February here; business periods must follow Beijing midnight.
	assert.Equal(t, 2, int(now.UTC().Month()))
	loss := NewLogOther()
	loss.SetAdmin("profit", NewProfitSnapshot(250000, common.GetPointer(0.6), 0.5, common.QuotaPerUnit))
	for _, log := range []Log{
		{Type: LogTypeConsume, CreatedAt: time.Date(2030, 3, 1, 0, 0, 0, 0, location).Unix(), Quota: 250000, Other: other.JSONString()},
		{Type: LogTypeConsume, CreatedAt: time.Date(2030, 2, 28, 23, 59, 59, 0, location).Unix(), Quota: 250000, Other: loss.JSONString()},
		{Type: LogTypeConsume, CreatedAt: time.Date(2030, 2, 1, 0, 0, 0, 0, location).Unix(), Quota: 500000, Other: "{}"},
	} {
		require.NoError(t, db.Create(&log).Error)
	}
	overview, err := QueryProfitOverview(context.Background(), now)
	require.NoError(t, err)
	assert.Equal(t, "Asia/Shanghai", overview.Timezone)
	assert.Equal(t, 1, overview.Today.Requests)
	assert.InDelta(t, 0.3, overview.Today.Cost, 1e-10)
	assert.InDelta(t, 0.2, overview.Today.GrossProfit, 1e-10)
	assert.InDelta(t, -0.1, overview.Yesterday.GrossProfit, 1e-10)
	assert.InDelta(t, 0.2, overview.Month.GrossProfit, 1e-10)
	assert.Equal(t, 6, overview.Lifetime.Requests)
	assert.InDelta(t, 0.3, overview.Lifetime.GrossProfit, 1e-10)
	require.NotNil(t, overview.Lifetime.Margin)
	assert.InDelta(t, 20, *overview.Lifetime.Margin, 1e-8)
	assert.Equal(t, 3, overview.Lifetime.UnknownRequests)
	repeated, err := QueryProfitOverview(context.Background(), now)
	require.NoError(t, err)
	assert.Equal(t, overview, repeated, "refresh must not double-count logs")
	// A nearby lower ID may become visible after a newer log was collected.
	require.NoError(t, db.Create(&Log{Id: 20000, Type: LogTypeConsume, CreatedAt: now.Unix(), Quota: 250000, Other: other.JSONString()}).Error)
	_, err = QueryProfitOverview(context.Background(), now)
	require.NoError(t, err)
	require.NoError(t, db.Create(&Log{Id: 19999, Type: LogTypeConsume, CreatedAt: now.Unix(), Quota: 250000, Other: other.JSONString()}).Error)
	overview, err = QueryProfitOverview(context.Background(), now)
	require.NoError(t, err)
	assert.Equal(t, 8, overview.Lifetime.Requests)
	assert.InDelta(t, 0.7, overview.Lifetime.GrossProfit, 1e-10)
	// Re-running migrations and deleting source logs preserves recorded totals.
	require.NoError(t, db.AutoMigrate(&ProfitOverviewState{}))
	require.NoError(t, db.Where("type = ?", LogTypeConsume).Delete(&Log{}).Error)
	retained, err := QueryProfitOverview(context.Background(), now)
	require.NoError(t, err)
	assert.Equal(t, overview, retained)
	batch := make([]Log, 5001)
	for i := range batch {
		batch[i] = Log{Type: LogTypeConsume, CreatedAt: now.Unix(), Other: "{}"}
	}
	require.NoError(t, db.CreateInBatches(&batch, 100).Error)
	partial, err := QueryProfitOverview(context.Background(), now)
	require.NoError(t, err)
	assert.False(t, partial.Complete, "a partial history must never be presented as a complete total")
	assert.Equal(t, overview.ProcessedLogs+5000, partial.ProcessedLogs)
	completed, err := QueryProfitOverview(context.Background(), now)
	require.NoError(t, err)
	assert.True(t, completed.Complete)
	assert.Equal(t, overview.Lifetime.Requests+5001, completed.Lifetime.Requests)
	assert.InDelta(t, overview.Lifetime.GrossProfit, completed.Lifetime.GrossProfit, 1e-10)
}
