/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// External DSNs are only supplied by the disposable database verification script.
func TestPelicanAdminRecords(t *testing.T) {
	var dialect gorm.Dialector = sqlite.Open(filepath.Join(t.TempDir(), "records.db"))
	switch os.Getenv("PELICAN_TEST_DIALECT") {
	case "mysql":
		dialect = mysql.Open(os.Getenv("PELICAN_TEST_DSN"))
	case "postgres":
		dialect = postgres.Open(os.Getenv("PELICAN_TEST_DSN"))
	}
	db, err := gorm.Open(dialect, &gorm.Config{})
	require.NoError(t, err)
	previous := model.DB
	model.DB = db
	t.Cleanup(func() {
		model.DB = previous
		sqlDB, _ := db.DB()
		_ = sqlDB.Close()
	})
	require.NoError(t, db.AutoMigrate(&model.PelicanSample{}))
	versionSQL := "SELECT version()"
	if dialect.Name() == "sqlite" {
		versionSQL = "SELECT sqlite_version()"
	}
	var version string
	require.NoError(t, db.Raw(versionSQL).Scan(&version).Error)
	t.Logf("database=%s version=%s", dialect.Name(), version)
	now := time.Now()
	fixtures := []model.PelicanSample{
		{Status: "success", ModelName: "model-a"},
		{Status: "failed", ModelName: "model-a", ErrorCode: "upstream_error"},
		{Status: "running", ModelName: "model-a", CheckedAt: now.Add(-10 * time.Minute).Unix()},
		{Status: "running", ModelName: "model-a", CheckedAt: now.Add(-4 * time.Minute).Unix()},
		{Status: "running", ModelName: "model-a"},
		{Status: "failed", ModelName: "model-b"},
	}
	for index := range fixtures {
		fixtures[index].TargetKey = fmt.Sprintf("records-contract-%d", index)
		fixtures[index].RouteGroup = "records-contract"
		fixtures[index].Hour = now.Unix() / 3600 * 3600
		if fixtures[index].CheckedAt == 0 {
			fixtures[index].CheckedAt = now.Unix()
		}
		require.NoError(t, db.Create(&fixtures[index]).Error)
	}
	engine := gin.New()
	engine.GET("/samples", GetPelicanAdminSamples)
	role := common.RoleAdminUser
	engine.POST("/batch", func(c *gin.Context) {
		c.Set("role", role)
		BatchDeletePelicanSamples(c)
	})
	request := func(query string) struct {
		Success bool `json:"success"`
		Data    struct {
			Records    []model.PelicanSample `json:"records"`
			NextBefore int64                 `json:"next_before"`
		} `json:"data"`
	} {
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/samples?group=records-contract&model=model-a&"+query, nil))
		var body struct {
			Success bool `json:"success"`
			Data    struct {
				Records    []model.PelicanSample `json:"records"`
				NextBefore int64                 `json:"next_before"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &body))
		return body
	}
	t.Run("status filtering happens before cursor pagination", func(t *testing.T) {
		first := request("status=failed&limit=1")
		require.True(t, first.Success)
		require.Len(t, first.Data.Records, 1)
		require.Equal(t, fixtures[2].ID, first.Data.Records[0].ID)
		require.Equal(t, "interrupted", first.Data.Records[0].ErrorCode)
		second := request(fmt.Sprintf("status=failed&limit=1&before=%d", first.Data.NextBefore))
		require.Len(t, second.Data.Records, 1)
		require.Equal(t, fixtures[1].ID, second.Data.Records[0].ID)
		success := request("status=success")
		require.Len(t, success.Data.Records, 1)
		require.Equal(t, fixtures[0].ID, success.Data.Records[0].ID)
	})
	t.Run("live five-minute requests stay running and invalid statuses are rejected", func(t *testing.T) {
		all := request("status=all")
		require.Len(t, all.Data.Records, 5)
		for _, record := range all.Data.Records {
			if record.ID == fixtures[3].ID {
				require.Equal(t, "running", record.Status)
			}
		}
		require.False(t, request("status=unsupported").Success)
	})
	t.Run("invalid selections and ordinary users cannot delete any records", func(t *testing.T) {
		for _, body := range []string{`{}`, `{"ids":[]}`, `{"ids":[0]}`, `{"ids":[-1]}`, `{"filter":{"status":"failed"}}`, `{"ids":[` + strings.Repeat("1,", 1000) + "1]}"} {
			response := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/batch", strings.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			engine.ServeHTTP(response, req)
			var result struct {
				Success bool `json:"success"`
			}
			require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
			require.False(t, result.Success)
		}
		role = common.RoleCommonUser
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/batch", strings.NewReader(fmt.Sprintf(`{"ids":[%d]}`, fixtures[0].ID))))
		require.Equal(t, http.StatusForbidden, response.Code)
		role = common.RoleAdminUser
		var count int64
		require.NoError(t, db.Model(&model.PelicanSample{}).Where("route_group = ?", "records-contract").Count(&count).Error)
		require.Equal(t, int64(6), count)
	})
	t.Run("any administrator can delete selected finished IDs without touching active or unselected records", func(t *testing.T) {
		body, marshalErr := common.Marshal(map[string]any{"ids": []int64{fixtures[0].ID, fixtures[1].ID, fixtures[1].ID, fixtures[2].ID, fixtures[3].ID, fixtures[4].ID, 999999999}})
		require.NoError(t, marshalErr)
		response := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/batch", strings.NewReader(string(body)))
		req.Header.Set("Content-Type", "application/json")
		engine.ServeHTTP(response, req)
		var result struct {
			Success bool `json:"success"`
			Data    struct {
				Deleted int64 `json:"deleted"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
		require.True(t, result.Success)
		require.Equal(t, int64(3), result.Data.Deleted)
		var remaining []model.PelicanSample
		require.NoError(t, db.Where("route_group = ?", "records-contract").Order("id").Find(&remaining).Error)
		require.Equal(t, []int64{fixtures[3].ID, fixtures[4].ID, fixtures[5].ID}, []int64{remaining[0].ID, remaining[1].ID, remaining[2].ID})
	})
}
