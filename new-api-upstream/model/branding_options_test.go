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
func TestBrandingOptionsPersistence(t *testing.T) {
	var dialect gorm.Dialector = sqlite.Open(filepath.Join(t.TempDir(), "branding.db"))
	switch os.Getenv("BRANDING_TEST_DIALECT") {
	case "mysql":
		dialect = mysql.Open(os.Getenv("BRANDING_TEST_DSN"))
	case "postgres":
		dialect = postgres.Open(os.Getenv("BRANDING_TEST_DSN"))
	}
	db, err := gorm.Open(dialect, &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	previousDB := DB
	previousName, previousLogo, previousIcon := common.SystemName, common.Logo, common.Favicon
	common.OptionMapRWMutex.Lock()
	previousOptions := common.OptionMap
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()
	DB = db
	t.Cleanup(func() {
		DB = previousDB
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.SystemName, common.Logo, common.Favicon = previousName, previousLogo, previousIcon
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

	for key, value := range map[string]string{"SystemName": "25code", "Logo": "https://example.test/wide.svg", "Favicon": "https://example.test/tab.png"} {
		require.NoError(t, UpdateOption(key, value))
		var stored Option
		require.NoError(t, db.Where(&Option{Key: key}).First(&stored).Error)
		require.Equal(t, value, stored.Value)
	}
	common.SystemName, common.Logo, common.Favicon = "", "", ""
	loadOptionsFromDatabase()
	require.Equal(t, "25code", common.SystemName)
	require.Equal(t, "https://example.test/wide.svg", common.Logo)
	require.Equal(t, "https://example.test/tab.png", common.Favicon)
	require.NoError(t, UpdateOption("Favicon", ""))
	loadOptionsFromDatabase()
	require.Empty(t, common.Favicon)
	require.Equal(t, "https://example.test/wide.svg", common.Logo)
	require.NoError(t, db.Migrator().DropTable(&Option{}))
	for key := range map[string]string{"SystemName": "", "Logo": "", "Favicon": ""} {
		require.Error(t, UpdateOption(key, "failed-write"))
	}
	require.Equal(t, "25code", common.SystemName)
	require.Equal(t, "https://example.test/wide.svg", common.Logo)
	require.Empty(t, common.Favicon)
}
