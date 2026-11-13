package model

import (
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestImageStudioRecordsAreScopedAndBoundedPerUser(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&ImageStudioRecord{}, &Log{}))
	previousDB := DB
	DB = db
	previousLogDB := LOG_DB
	LOG_DB = db
	t.Cleanup(func() {
		DB = previousDB
		LOG_DB = previousLogDB
	})

	for i := range ImageStudioHistoryLimit + 2 {
		require.NoError(t, SaveImageStudioRecord(7, ImageStudioRecordInput{
			ID:        fmt.Sprintf("record-%02d", i),
			RequestID: fmt.Sprintf("request-%02d", i),
			Model:     "image-model",
			Prompt:    "a red tree",
			Sources:   []string{"data:image/png;base64,aW1hZ2U="},
		}, int64(i+1)))
	}
	require.NoError(t, SaveImageStudioRecord(8, ImageStudioRecordInput{
		ID: "other-user-record", RequestID: "other-user-request", Model: "image-model", Prompt: "private", Sources: []string{"https://images.example/image.png"},
	}, 100))

	userRecords, err := GetImageStudioRecords(7)
	require.NoError(t, err)
	require.Len(t, userRecords, ImageStudioHistoryLimit)
	require.Equal(t, "record-31", userRecords[0].ID)
	require.Equal(t, 1, userRecords[0].ImageCount)
	require.Empty(t, userRecords[0].Sources)
	require.Equal(t, "record-02", userRecords[len(userRecords)-1].ID)
	otherUserRecord, err := GetImageStudioRecordForUser(8, "record-02")
	require.NoError(t, err)
	require.Nil(t, otherUserRecord)
	firstExpired, err := GetImageStudioRecordForUser(7, "record-00")
	require.NoError(t, err)
	require.Nil(t, firstExpired)

	studioLog := Log{UserId: 7, RequestId: "verified-request", Type: LogTypeConsume, Other: `{"admin_info":{"image_studio":true}}`}
	require.NoError(t, db.Create(&studioLog).Error)
	owned, err := IsImageStudioRequestOwner(7, "verified-request")
	require.NoError(t, err)
	require.True(t, owned)
	owned, err = IsImageStudioRequestOwner(8, "verified-request")
	require.NoError(t, err)
	require.False(t, owned)
	require.NoError(t, db.Create(&Log{UserId: 7, RequestId: "ordinary-request", Type: LogTypeConsume, Other: `{}`}).Error)
	owned, err = IsImageStudioRequestOwner(7, "ordinary-request")
	require.NoError(t, err)
	require.False(t, owned)
}

func TestImageStudioRecordStoresLargeImageSources(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&ImageStudioRecord{}))
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })

	source := "data:image/png;base64," + strings.Repeat("A", 96<<10)
	require.NoError(t, SaveImageStudioRecord(7, ImageStudioRecordInput{
		ID: "large-image-record", RequestID: "large-image-request", Model: "image-model", Prompt: "a tree", Sources: []string{source},
	}, 1))

	record, err := GetImageStudioRecordForUser(7, "large-image-record")
	require.NoError(t, err)
	require.NotNil(t, record)
	var stored []string
	require.NoError(t, common.UnmarshalJsonStr(string(record.Sources), &stored))
	require.Equal(t, []string{source}, stored)
}

type imageStudioRecordTextV1 struct {
	ID         string `gorm:"primaryKey;size:64"`
	UserID     int    `gorm:"primaryKey;index:idx_image_studio_user_created,priority:1"`
	RequestID  string `gorm:"uniqueIndex;size:64;not null"`
	Model      string `gorm:"size:128;not null"`
	Prompt     string `gorm:"type:text;not null"`
	ImageCount int    `gorm:"not null"`
	CreatedAt  int64  `gorm:"index:idx_image_studio_user_created,priority:2"`
	Sources    string `gorm:"type:text;not null"`
}

func TestImageStudioSourcesColumnUpgradesFromText(t *testing.T) {
	testCases := []struct {
		name      string
		dsnEnv    string
		dialector func(string) gorm.Dialector
	}{
		{name: "sqlite", dialector: func(string) gorm.Dialector { return sqlite.Open(":memory:") }},
		{name: "mysql", dsnEnv: "TEST_MYSQL_DSN", dialector: mysql.Open},
		{name: "postgres", dsnEnv: "TEST_POSTGRES_DSN", dialector: postgres.Open},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			dsn := ""
			if tc.dsnEnv != "" {
				dsn = os.Getenv(tc.dsnEnv)
				if dsn == "" {
					t.Skipf("%s is not configured", tc.dsnEnv)
				}
			}
			db, err := gorm.Open(tc.dialector(dsn), &gorm.Config{})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			t.Cleanup(func() { _ = sqlDB.Close() })

			recorder := &migrationSQLRecorder{}
			freshTable := "image_studio_sources_fresh_test"
			t.Cleanup(func() { _ = db.Migrator().DropTable(freshTable) })
			freshDB := db.Table(freshTable).Session(&gorm.Session{Logger: recorder})
			require.NoError(t, freshDB.AutoMigrate(&ImageStudioRecord{}))
			columns, err := freshDB.Migrator().ColumnTypes(&ImageStudioRecord{})
			require.NoError(t, err)
			for _, column := range columns {
				if column.Name() == "sources" {
					expectedType := "text"
					if tc.name == "mysql" {
						expectedType = "longtext"
					}
					require.Equal(t, expectedType, strings.ToLower(column.DatabaseTypeName()))
				}
			}
			freshLarge := ImageStudioRecord{
				ID: "fresh-large-record", UserID: 7, RequestID: "fresh-large-request", Model: "image-model",
				Prompt: "fresh", ImageCount: 1, CreatedAt: 1,
				Sources: LongText(`["data:image/png;base64,` + strings.Repeat("A", 96<<10) + `"]`),
			}
			require.NoError(t, freshDB.Create(&freshLarge).Error)
			recorder.reset()
			require.NoError(t, freshDB.AutoMigrate(&ImageStudioRecord{}))
			require.Empty(t, recorder.schemaMutations())
			require.NoError(t, db.Migrator().DropTable(freshTable))

			const table = "image_studio_sources_migration_test"
			t.Cleanup(func() { _ = db.Migrator().DropTable(table) })
			tableDB := db.Table(table)
			require.NoError(t, tableDB.AutoMigrate(&imageStudioRecordTextV1{}))
			legacy := imageStudioRecordTextV1{
				ID: "legacy-record", UserID: 7, RequestID: "legacy-request", Model: "image-model",
				Prompt: "legacy", ImageCount: 1, CreatedAt: 1, Sources: `["data:image/png;base64,bGVnYWN5"]`,
			}
			require.NoError(t, tableDB.Create(&legacy).Error)

			tableDB = tableDB.Session(&gorm.Session{Logger: recorder})
			require.NoError(t, tableDB.AutoMigrate(&ImageStudioRecord{}))
			columns, err = tableDB.Migrator().ColumnTypes(&ImageStudioRecord{})
			require.NoError(t, err)
			for _, column := range columns {
				if column.Name() == "sources" && tc.name == "mysql" {
					require.Equal(t, "longtext", strings.ToLower(column.DatabaseTypeName()))
				}
			}

			largeSources := LongText(`["data:image/png;base64,` + strings.Repeat("A", 96<<10) + `"]`)
			large := ImageStudioRecord{
				ID: "large-record", UserID: 7, RequestID: "large-request", Model: "image-model",
				Prompt: "large", ImageCount: 1, CreatedAt: 2, Sources: largeSources,
			}
			require.NoError(t, tableDB.Create(&large).Error)
			var saved ImageStudioRecord
			require.NoError(t, tableDB.First(&saved, "id = ? AND user_id = ?", "legacy-record", 7).Error)
			require.Equal(t, LongText(legacy.Sources), saved.Sources)
			require.NoError(t, tableDB.First(&saved, "id = ? AND user_id = ?", "large-record", 7).Error)
			require.Equal(t, largeSources, saved.Sources)
			indexes, err := tableDB.Migrator().GetIndexes(&ImageStudioRecord{})
			require.NoError(t, err)
			var hasUserCreatedIndex bool
			for _, index := range indexes {
				if index.Name() == "idx_image_studio_user_created" {
					require.ElementsMatch(t, []string{"user_id", "created_at"}, index.Columns())
					hasUserCreatedIndex = true
				}
			}
			require.True(t, hasUserCreatedIndex)
			require.Error(t, tableDB.Create(&ImageStudioRecord{
				ID: "duplicate-request-record", UserID: 7, RequestID: "legacy-request", Model: "image-model",
				Prompt: "duplicate", ImageCount: 1, CreatedAt: 3, Sources: LongText(`[]`),
			}).Error)

			recorder.reset()
			require.NoError(t, tableDB.AutoMigrate(&ImageStudioRecord{}))
			require.Empty(t, recorder.schemaMutations())
		})
	}
}
