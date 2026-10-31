package model

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// CHANNEL_HEALTH_TEST_DSN must point at an isolated, disposable test database.
// This same behavior suite is run against all three supported database engines.
func TestChannelHealthPersistence(t *testing.T) {
	var dialect gorm.Dialector = sqlite.Open(filepath.Join(t.TempDir(), "health.db"))
	switch os.Getenv("CHANNEL_HEALTH_TEST_DIALECT") {
	case "mysql":
		dialect = mysql.Open(os.Getenv("CHANNEL_HEALTH_TEST_DSN"))
	case "postgres":
		dialect = postgres.Open(os.Getenv("CHANNEL_HEALTH_TEST_DSN"))
	}
	db, err := gorm.Open(dialect, &gorm.Config{})
	require.NoError(t, err)
	versionQuery := "SELECT sqlite_version()"
	if dialect.Name() != "sqlite" {
		versionQuery = "SELECT version()"
	}
	var version string
	require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
	t.Logf("database=%s version=%s", dialect.Name(), version)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	previous := DB
	DB = db
	t.Cleanup(func() { DB = previous })

	// Representative existing schema/data, including the relay metric unique index.
	require.NoError(t, db.AutoMigrate(&PerfMetric{}))
	sentinel := PerfMetric{ModelName: "existing-model", Group: "existing-group", BucketTs: 12300, RequestCount: 7, SuccessCount: 6}
	require.NoError(t, db.Create(&sentinel).Error)
	for range 2 {
		require.NoError(t, db.AutoMigrate(&PerfMetric{}, &ChannelHealthCheck{}))
		require.True(t, db.Migrator().HasIndex(&ChannelHealthCheck{}, "idx_channel_health_group_time"))
		require.True(t, db.Migrator().HasIndex(&PerfMetric{}, "idx_perf_model_group_bucket"))
	}
	var existing PerfMetric
	require.NoError(t, db.First(&existing, sentinel.Id).Error)
	require.Equal(t, int64(7), existing.RequestCount)
	require.Equal(t, int64(6), existing.SuccessCount)
	duplicate := sentinel
	duplicate.Id = 0
	require.Error(t, db.Create(&duplicate).Error, "pre-existing uniqueness must be preserved")

	now := time.Unix(1800000100, 0)
	channel := &Channel{Id: 14, Group: "alpha,alpha,beta"}
	require.NoError(t, RecordChannelHealthCheck(nil, now.Unix(), true, 0))
	require.NoError(t, RecordChannelHealthCheck(&Channel{Id: 99, Group: ","}, now.Unix(), true, 0))
	empty, err := QueryChannelHealth("alpha", 8, now)
	require.NoError(t, err)
	require.Nil(t, empty.Summary)
	require.Empty(t, empty.SuccessSeries, "unsampled intervals must not become healthy")
	require.Equal(t, int64(96), (empty.WindowEnd-empty.WindowStart)/300+1)

	require.NoError(t, RecordChannelHealthCheck(channel, now.Unix()-400, false, -50))
	require.NoError(t, RecordChannelHealthCheck(channel, now.Unix()-300, true, 200))
	require.NoError(t, RecordChannelHealthCheck(&Channel{Id: 15, Group: "all,alpha"}, now.Unix()-200, true, 100))
	require.NoError(t, RecordChannelHealthCheck(&Channel{Id: 16, Group: "gamma"}, now.Unix()-100, false, 10))
	var count int64
	require.NoError(t, db.Model(&ChannelHealthCheck{}).Count(&count).Error)
	require.Equal(t, int64(6), count, "deduplicate channel groups and wildcard coverage")
	result, err := QueryChannelHealth("alpha", 8, now)
	require.NoError(t, err)
	require.NotNil(t, result.Summary)
	require.InDelta(t, 200.0/3.0, result.Summary.SuccessRate, 0.0001)
	require.Equal(t, int64(100), result.Summary.AvgLatencyMs)
	require.Equal(t, now.Unix()-200, result.LastCheckedAt)
	require.Equal(t, "channel_checks", result.Source)
	require.Equal(t, int64(300), result.BucketSeconds)
	for i := 1; i < len(result.SuccessSeries); i++ {
		require.Less(t, result.SuccessSeries[i-1].Ts, result.SuccessSeries[i].Ts)
	}
	for _, group := range []string{"beta", "unknown"} {
		other, err := QueryChannelHealth(group, 8, now)
		require.NoError(t, err)
		require.NotNil(t, other.Summary)
		if group == "beta" {
			require.InDelta(t, result.Summary.SuccessRate, other.Summary.SuccessRate, 0.0001)
		} else {
			require.Equal(t, 100.0, other.Summary.SuccessRate, "wildcard channels serve any route group")
		}
	}
	blank, err := QueryChannelHealth("", 8, now)
	require.NoError(t, err)
	require.Nil(t, blank.Summary)

	// Old/future samples are excluded; cleanup only removes expired probe history.
	require.NoError(t, db.Create(&ChannelHealthCheck{ChannelID: 14, RouteGroup: "alpha", CheckedAt: now.Unix() - 31*86400, Success: true}).Error)
	require.NoError(t, db.Create(&ChannelHealthCheck{ChannelID: 14, RouteGroup: "alpha", CheckedAt: now.Unix() + 3600, Success: true}).Error)
	again, err := QueryChannelHealth("alpha", 8, now)
	require.NoError(t, err)
	require.Equal(t, result.Summary, again.Summary)
	require.NoError(t, RecordChannelHealthCheck(channel, now.Unix()-10, false, 50))
	require.NoError(t, db.Model(&ChannelHealthCheck{}).Where("checked_at < ?", now.Unix()-30*86400).Count(&count).Error)
	require.Zero(t, count)
	require.NoError(t, db.First(&existing, sentinel.Id).Error)
	require.Equal(t, int64(7), existing.RequestCount, "probes must never affect relay usage")
	failed, err := QueryChannelHealth("gamma", 8, now)
	require.NoError(t, err)
	require.NotNil(t, failed.Summary)
	require.Equal(t, 50.0, failed.Summary.SuccessRate, "real failures and wildcard success are both counted")
}
