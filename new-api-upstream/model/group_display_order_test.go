package model

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// The optional DSN must refer to an isolated, disposable test database.
func TestGroupDisplayOrderPersistence(t *testing.T) {
	var dialect gorm.Dialector = sqlite.Open(filepath.Join(t.TempDir(), "groups.db"))
	switch os.Getenv("GROUP_ORDER_TEST_DIALECT") {
	case "mysql":
		dialect = mysql.Open(os.Getenv("GROUP_ORDER_TEST_DSN"))
	case "postgres":
		dialect = postgres.Open(os.Getenv("GROUP_ORDER_TEST_DSN"))
	}
	db, err := gorm.Open(dialect, &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	previousDB := DB
	DB = db
	common.OptionMapRWMutex.Lock()
	previousOptions := common.OptionMap
	common.OptionMap = map[string]string{GroupDisplayOrderOption: "[]"}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		DB = previousDB
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
	})
	require.NoError(t, db.AutoMigrate(&Option{}))
	query := "SELECT version()"
	if dialect.Name() == "sqlite" {
		query = "SELECT sqlite_version()"
	}
	var version string
	require.NoError(t, db.Raw(query).Scan(&version).Error)
	t.Logf("database=%s version=%s", dialect.Name(), version)
	order := `["10","hidden","2","deleted","vip"]`
	require.NoError(t, UpdateOption(GroupDisplayOrderOption, order))
	usable := map[string]string{"2": "", "10": "", "vip": "", "new": "", "auto": ""}
	require.Equal(t, []string{"10", "2", "vip", "new"}, GetGroupDisplayOrder(usable))
	require.Equal(t, []string{}, GetGroupDisplayOrder(nil))
	for _, invalid := range []string{`null`, `{}`, `[1]`, `["vip","vip"]`, `[""]`, `[" vip"]`, `broken`} {
		require.Error(t, UpdateOption(GroupDisplayOrderOption, invalid), invalid)
		var stored Option
		require.NoError(t, db.Where(&Option{Key: GroupDisplayOrderOption}).First(&stored).Error)
		require.Equal(t, order, stored.Value)
		require.Equal(t, []string{"10", "2", "vip", "new"}, GetGroupDisplayOrder(usable))
	}
	// Reload using the production cache loader, simulating a process restart.
	common.OptionMapRWMutex.Lock()
	common.OptionMap[GroupDisplayOrderOption] = "[]"
	common.OptionMapRWMutex.Unlock()
	loadOptionsFromDatabase()
	require.Equal(t, []string{"10", "2", "vip", "new"}, GetGroupDisplayOrder(usable))
	require.NoError(t, UpdateOption(GroupDisplayOrderOption, "[]"))
	require.Equal(t, []string{"10", "2", "new", "vip"}, GetGroupDisplayOrder(usable))
	// A failed write must not appear successful or change the live display order.
	require.NoError(t, db.Migrator().DropTable(&Option{}))
	require.Error(t, UpdateOption(GroupDisplayOrderOption, `["vip"]`))
	require.Equal(t, []string{"10", "2", "new", "vip"}, GetGroupDisplayOrder(usable))
}
