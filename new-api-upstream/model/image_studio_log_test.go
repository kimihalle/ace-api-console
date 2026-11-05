package model

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestImageStudioMetadataOnlyMarksStudioImageRequests(t *testing.T) {
	for _, tc := range []struct {
		name   string
		path   string
		header string
		marked bool
	}{
		{name: "studio image", path: "/v1/images/generations", header: "1", marked: true},
		{name: "ordinary image", path: "/v1/images/generations"},
		{name: "other endpoint", path: "/v1/chat/completions", header: "1"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
			ctx.Request = httptest.NewRequest(http.MethodPost, tc.path, nil)
			ctx.Request.Header.Set("X-Ace-Image-Studio", tc.header)
			ctx.Set("image_studio_prompt", "a tree")
			ctx.Set("image_studio_count", 2)
			other := NewLogOther()
			recordImageStudioMetadata(ctx, other)
			serialized := other.JSONString()
			if tc.marked {
				require.Contains(t, serialized, `"image_studio":true`)
				require.Contains(t, serialized, `"image_studio_count":2`)
				require.Contains(t, serialized, `"image_studio_prompt":"a tree"`)
			} else {
				require.NotContains(t, serialized, `"image_studio":true`)
			}
		})
	}
}

func TestImageStudioLogFilterOnlyReturnsMarkedRequests(t *testing.T) {
	var dialect gorm.Dialector = sqlite.Open(":memory:")
	switch os.Getenv("IMAGE_STUDIO_TEST_DIALECT") {
	case "mysql":
		dialect = mysql.Open(os.Getenv("IMAGE_STUDIO_TEST_DSN"))
	case "postgres":
		dialect = postgres.Open(os.Getenv("IMAGE_STUDIO_TEST_DSN"))
	}
	db, err := gorm.Open(dialect, &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Log{}))
	require.NoError(t, db.Create(&Log{Type: LogTypeConsume, ModelName: "image", Other: `{"admin_info":{"image_studio":true}}`}).Error)
	require.NoError(t, db.Create(&Log{Type: LogTypeConsume, ModelName: "image", Other: `{}`}).Error)
	query, err := (LogFilter{UsageOnly: true, ImageStudioOnly: true}).apply(db)
	require.NoError(t, err)
	var count int64
	require.NoError(t, query.Model(&Log{}).Count(&count).Error)
	require.EqualValues(t, 1, count)
}
