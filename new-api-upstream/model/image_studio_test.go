package model

import (
	"fmt"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
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
