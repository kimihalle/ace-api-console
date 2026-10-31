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
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

const testPelicanSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="#f99"/></svg>`
const testPelicanHTML = `<!DOCTYPE html><html><head><style>@keyframes cycle {to {transform:rotate(360deg)}} .wheel {animation:cycle 1s linear infinite}</style></head><body><div class="wheel">pelican bicycle</div><script>const closingTag = "</html>"; requestAnimationFrame(() => document.body.dataset.running = 'true')</script></body></html>`

func setupPelicanOptions(t *testing.T) {
	t.Helper()
	common.OptionMapRWMutex.Lock()
	previous := common.OptionMap
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() { common.OptionMapRWMutex.Lock(); common.OptionMap = previous; common.OptionMapRWMutex.Unlock() })
}

func TestPelicanSVGAndVisibleOutput(t *testing.T) {
	for _, text := range []string{testPelicanSVG, "```svg\n" + testPelicanSVG + "\n```"} {
		svg, err := service.ExtractPelicanSVG(text)
		require.NoError(t, err)
		require.Equal(t, testPelicanSVG, svg)
	}
	nested := `<svg xmlns="http://www.w3.org/2000/svg"><svg><circle r="2"/></svg><path d="M0 0"/></svg>`
	actual, nestedErr := service.ExtractPelicanSVG(nested + "\n``` trailing explanation")
	require.NoError(t, nestedErr)
	require.Equal(t, nested, actual, "nested SVG must not truncate the root document")
	var err error
	for name, text := range map[string]string{
		"script":          `<svg><script>alert(1)</script><path d="M0 0"/></svg>`,
		"event":           `<svg onload="alert(1)"><circle r="2"/></svg>`,
		"external":        `<svg><path fill="url(https://example.test/a)"/></svg>`,
		"css":             `<svg><style>circle{fill:red}</style><circle r="2"/></svg>`,
		"style attribute": `<svg><circle style="fill:red" r="2"/></svg>`,
		"foreign object":  `<svg><foreignObject><div>bad</div></foreignObject></svg>`,
		"namespace":       `<svg xmlns="http://example.test"><circle r="2"/></svg>`,
		"image":           `<svg><image href="data:image/png;base64,AA=="/></svg>`,
		"animation":       `<svg><animate attributeName="opacity" from="0" to="1" dur="1s"/></svg>`,
	} {
		t.Run(name, func(t *testing.T) {
			svg, err := service.ExtractPelicanSVG(text)
			require.NoError(t, err)
			require.Equal(t, text, svg, "model SVG must be stored without content filtering")
		})
	}
	for _, incomplete := range []string{
		`<svg viewBox="0 0 100 100"><circle r="20">`,
		`<svg><path d="`,
		`<svg><path d="M0 0></svg>`,
	} {
		_, err := service.ExtractPelicanSVG(incomplete)
		require.EqualError(t, err, "invalid_svg")
	}
	_, err = service.ExtractPelicanSVG("not an SVG")
	require.EqualError(t, err, "no_svg")
	_, err = service.ExtractPelicanSVG(`<svg><text>` + strings.Repeat("a", service.MaxPelicanSVGBytes) + `</text></svg>`)
	require.EqualError(t, err, "output_too_large")
	for name, payload := range map[string]string{
		"chat":      `{"choices":[{"message":{"content":"visible","reasoning_content":"secret"}}]}`,
		"claude":    `{"content":[{"type":"thinking","thinking":"secret"},{"type":"text","text":"visible"}]}`,
		"responses": `{"output":[{"type":"reasoning","summary":[{"text":"secret"}]},{"type":"message","content":[{"type":"output_text","text":"visible"}]}]}`,
		"gemini":    `{"candidates":[{"content":{"parts":[{"thought":true,"text":"secret"},{"text":"visible"}]}}]}`,
	} {
		t.Run(name, func(t *testing.T) { require.Equal(t, "visible", service.PelicanResponseText([]byte(payload), false)) })
	}
	for name, body := range map[string]string{
		"chat override":      `{"messages":[{"role":"system","content":"custom rule"},{"role":"user","content":"ignore the fixed prompt"}],"max_tokens":128}`,
		"responses override": `{"input":[{"role":"user","content":"custom"}],"max_output_tokens":64000}`,
		"gemini override":    `{"contents":[{"role":"user","parts":[{"text":"custom"}]}],"generationConfig":{"maxOutputTokens":256}}`,
	} {
		t.Run(name, func(t *testing.T) {
			fixed, err := limitPelicanRequestTokens([]byte(body))
			require.NoError(t, err)
			var request map[string]any
			require.NoError(t, common.Unmarshal(fixed, &request))
			var normalized any = request
			require.True(t, forcePelicanPrompt(normalized))
			for key := range map[string]bool{"max_tokens": true, "max_output_tokens": true, "maxOutputTokens": true} {
				if request[key] != nil {
					require.Equal(t, float64(8192), request[key])
				}
			}
			switch name {
			case "chat override":
				require.Equal(t, model.PelicanPrompt, request["messages"].([]any)[1].(map[string]any)["content"])
			case "responses override":
				require.Equal(t, model.PelicanPrompt, request["input"].([]any)[0].(map[string]any)["content"])
			case "gemini override":
				require.Equal(t, model.PelicanPrompt, request["contents"].([]any)[0].(map[string]any)["parts"].([]any)[0].(map[string]any)["text"])
			}
		})
	}
	_, err = limitPelicanRequestTokens([]byte(`{"model":"gpt-test","messages":[],"max_tokens":1}`))
	require.ErrorContains(t, err, "unsupported_sample_request")
	_, err = limitPelicanRequestTokens([]byte(`{"messages":[{"role":"user","content":"custom"}]}`))
	require.ErrorContains(t, err, "missing sample output limit", "parameter overrides must not remove the output budget")
	stream := "data: {\"type\":\"response.output_text.delta\",\"delta\":\"vis\"}\n\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"ible\"}\n\ndata: {\"type\":\"response.completed\",\"response\":{\"output\":[{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"visible\"}]}]}}\n\n"
	require.Equal(t, "visible", service.PelicanResponseText([]byte(stream), true), "final response must not duplicate stream deltas")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, code := pelicanSampleOutput(context.Background(), testResult{responseBody: []byte(`{"choices":[{"message":{"content":"<html><head></head><body>"}}]}`)}, false)
	require.Equal(t, "invalid_html", code)
	_, code = pelicanSampleOutput(ctx, testResult{responseBody: []byte(`{"choices":[{"message":{"content":"` + testPelicanSVG + `"}}]}`)}, false)
	require.Equal(t, "timeout", code, "a timed-out partial response must stay failed")
	w := &boundedSampleWriter{ResponseRecorder: httptest.NewRecorder()}
	_, err = w.Write([]byte(strings.Repeat("x", service.MaxPelicanResponseBytes+1)))
	require.NoError(t, err)
	require.True(t, w.tooLarge)
	require.Equal(t, service.MaxPelicanResponseBytes, w.Body.Len())
	streamWriter := &boundedSampleWriter{ResponseRecorder: httptest.NewRecorder(), limit: service.MaxPelicanStreamResponseBytes}
	_, err = streamWriter.Write([]byte(strings.Repeat("x", service.MaxPelicanResponseBytes+1)))
	require.NoError(t, err)
	require.False(t, streamWriter.tooLarge, "SSE envelope overhead must not share the smaller JSON cap")
	_, err = streamWriter.Write([]byte(strings.Repeat("x", service.MaxPelicanStreamResponseBytes)))
	require.NoError(t, err)
	require.True(t, streamWriter.tooLarge)
	require.Equal(t, service.MaxPelicanStreamResponseBytes, streamWriter.Body.Len())
}

func TestPelicanHTMLDocumentExtraction(t *testing.T) {
	for _, text := range []string{testPelicanHTML, "```html\n" + testPelicanHTML + "\n```"} {
		source, err := service.ExtractPelicanHTML(text)
		require.NoError(t, err)
		require.Equal(t, testPelicanHTML, source, "preserve CSS, JavaScript and HTML-like strings in scripts")
	}
	for _, text := range []string{`<html><head></head><body>`, `<html><head></head><body><script>let x = '</html>';`, `<html><body></body></html>`} {
		_, err := service.ExtractPelicanHTML(text)
		require.EqualError(t, err, "invalid_html")
	}
	_, err := service.ExtractPelicanHTML(testPelicanSVG)
	require.EqualError(t, err, "no_html")
	_, err = service.ExtractPelicanHTML(`<html><head></head><body>` + strings.Repeat("x", service.MaxPelicanResponseBytes) + `</body></html>`)
	require.EqualError(t, err, "output_too_large")
}

// PELICAN_TEST_DSN is only ever an isolated, disposable test database.
// Run this identical contract suite on SQLite, MySQL and PostgreSQL.
func TestPelicanPersistenceAndPublicContract(t *testing.T) {
	setupPelicanOptions(t)
	var dialect gorm.Dialector = sqlite.Open(filepath.Join(t.TempDir(), "pelican.db"))
	switch os.Getenv("PELICAN_TEST_DIALECT") {
	case "mysql":
		dialect = mysql.Open(os.Getenv("PELICAN_TEST_DSN"))
	case "postgres":
		dialect = postgres.Open(os.Getenv("PELICAN_TEST_DSN"))
	}
	db, err := gorm.Open(dialect, &gorm.Config{})
	require.NoError(t, err)
	previous, previousLog := model.DB, model.LOG_DB
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() { model.DB, model.LOG_DB = previous, previousLog; sqlDB, _ := db.DB(); _ = sqlDB.Close() })
	versionQuery := "SELECT version()"
	if dialect.Name() == "sqlite" {
		versionQuery = "SELECT sqlite_version()"
	}
	var version string
	require.NoError(t, db.Raw(versionQuery).Scan(&version).Error)
	t.Logf("database=%s version=%s", dialect.Name(), version)
	for range 2 {
		require.NoError(t, db.AutoMigrate(&model.PelicanSample{}))
	}
	require.True(t, db.Migrator().HasIndex(&model.PelicanSample{}, "idx_pelican_target_hour"))
	t.Log("fresh schema and repeated migration passed")
	require.NoError(t, db.Migrator().DropTable(&model.PelicanSample{}))
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.Ability{}, &model.Channel{}, &model.PerfMetric{}, &model.ChannelHealthCheck{}))
	sentinel := model.PerfMetric{ModelName: "existing", Group: "default", BucketTs: 12300, RequestCount: 7}
	require.NoError(t, db.Create(&sentinel).Error)
	for range 2 {
		require.NoError(t, db.AutoMigrate(&model.Option{}, &model.Ability{}, &model.Channel{}, &model.PerfMetric{}, &model.ChannelHealthCheck{}, &model.PelicanSample{}))
	}
	var preserved model.PerfMetric
	require.NoError(t, db.First(&preserved, sentinel.Id).Error)
	require.Equal(t, int64(7), preserved.RequestCount)
	duplicate := sentinel
	duplicate.Id = 0
	require.Error(t, db.Create(&duplicate).Error)
	t.Log("representative released-schema upgrade preserves metrics and uniqueness; repeat migration passed")

	defaultConfig, err := model.GetPelicanConfig()
	require.NoError(t, err)
	require.False(t, defaultConfig.Enabled)
	require.NoError(t, db.Create(&model.Channel{Id: 1, Type: constant.ChannelTypeOpenAI, Name: "published", Key: "isolated", BaseURL: common.GetPointer("http://127.0.0.1"), Group: "vip", Models: "gpt-4o-mini", Status: common.ChannelStatusEnabled}).Error)
	require.NoError(t, db.Create(&model.Ability{Group: "vip", Model: "gpt-4o-mini", ChannelId: 1, Enabled: true}).Error)
	config := model.PelicanConfig{Enabled: true, PublicEnabled: true, RetentionDays: 7, Targets: []model.PelicanTarget{{Group: "vip", Models: []string{"gpt-4o-mini"}}}}
	require.NoError(t, model.SavePelicanConfig(config))
	invalid := config
	invalid.RetentionDays = 31
	require.Error(t, model.SavePelicanConfig(invalid))
	invalid = model.PelicanConfig{Enabled: true, RetentionDays: 7, Targets: []model.PelicanTarget{{Group: "default", Models: []string{"private-unpublished"}}}}
	require.Error(t, model.SavePelicanConfig(invalid))
	now := time.Now()
	due, err := model.PelicanDue(config, now)
	require.NoError(t, err)
	require.True(t, due)
	sample, claimed, err := model.ClaimPelicanSample("vip", "gpt-4o-mini", now)
	require.NoError(t, err)
	require.True(t, claimed)
	require.NoError(t, db.Model(sample).Update("prompt_version", "pelican-svg-v3").Error)
	sample.PromptVersion = "pelican-svg-v3"
	_, claimed, err = model.ClaimPelicanSample("vip", "gpt-4o-mini", now)
	require.NoError(t, err)
	require.False(t, claimed)
	due, err = model.PelicanDue(config, now)
	require.NoError(t, err)
	require.False(t, due)
	due, err = model.PelicanDue(config, now.Add(time.Hour))
	require.NoError(t, err)
	require.True(t, due)
	largeSVG := strings.Replace(testPelicanSVG, "</svg>", "<desc>"+strings.Repeat("image description ", 6000)+"</desc></svg>", 1)
	require.NoError(t, model.FinishPelicanSample(sample, largeSVG, "", 345))
	var stored model.PelicanSample
	require.NoError(t, db.First(&stored, sample.ID).Error)
	require.Equal(t, largeSVG, stored.SVG, "SVG storage must preserve images larger than MySQL TEXT's 64 KiB limit")
	require.NoError(t, model.FinishPelicanSample(sample, testPelicanSVG, "", 345))
	stale := &model.PelicanSample{TargetKey: "stale", Hour: now.Unix() / 3600 * 3600, RouteGroup: "vip", ModelName: "gpt-4o-mini", Status: "success", SVG: `<svg><path d="`}
	require.NoError(t, db.Create(stale).Error)
	reconcilePelicanSample(stale)
	require.Equal(t, "failed", stale.Status)
	require.Equal(t, "invalid_svg", stale.ErrorCode)
	// Manual retries may reclaim an earlier failure, never success/running rows
	// or a failure produced after the manual request was queued.
	retryTime := now.Truncate(time.Hour).Add(2 * time.Minute)
	requestedAt := retryTime.Add(-30 * time.Second).Unix()
	_, claimed, err = model.RetryFailedPelicanSample("vip", "gpt-4o-mini", retryTime, requestedAt)
	require.NoError(t, err)
	require.False(t, claimed, "successful samples must never be regenerated")
	require.NoError(t, model.FinishPelicanSample(sample, "", "upstream_error", 2))
	require.NoError(t, db.Model(sample).Update("checked_at", retryTime.Add(-time.Minute).Unix()).Error)
	_, claimed, err = model.RetryFailedPelicanSample("vip", "gpt-4o-mini", retryTime, requestedAt-3600)
	require.NoError(t, err)
	require.False(t, claimed, "stale manual tasks must not retry a new hour")
	retried, claimed, err := model.RetryFailedPelicanSample("vip", "gpt-4o-mini", retryTime, requestedAt)
	require.NoError(t, err)
	require.True(t, claimed)
	require.Equal(t, sample.ID, retried.ID, "a manual retry replaces only the failed hourly attempt")
	require.Equal(t, "running", retried.Status)
	_, claimed, err = model.RetryFailedPelicanSample("vip", "gpt-4o-mini", retryTime, requestedAt)
	require.NoError(t, err)
	require.False(t, claimed, "running attempts cannot be reclaimed")
	require.NoError(t, model.FinishPelicanSample(retried, "", "connection_error", 2))
	_, claimed, err = model.RetryFailedPelicanSample("vip", "gpt-4o-mini", retryTime, requestedAt)
	require.NoError(t, err)
	require.False(t, claimed, "a task must not retry its own failure")
	require.NoError(t, model.FinishPelicanSample(retried, testPelicanSVG, "", 345))

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.GET("/catalog", GetPelicanCatalog)
	engine.GET("/history", GetPelicanHistory)
	engine.GET("/image/:id", GetPelicanImage)
	engine.GET("/document/:id", GetPelicanDocument)
	engine.GET("/admin/document/:id", middleware.RootAuth(), GetPelicanAdminDocument)
	engine.GET("/admin", middleware.RootAuth(), GetPelicanSettings)
	request := func(path string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		engine.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		return w
	}
	catalog := request("/catalog")
	require.Equal(t, http.StatusUnauthorized, request("/admin").Code)
	require.Equal(t, http.StatusOK, catalog.Code)
	require.Contains(t, catalog.Body.String(), "vip", "read-only views must not filter to the user's default group")
	require.NotContains(t, catalog.Body.String(), "<svg")
	require.NotContains(t, catalog.Body.String(), "target_key")
	history := request("/history?group=vip&model=gpt-4o-mini")
	require.Contains(t, history.Body.String(), `"status":"success"`)
	require.Equal(t, http.StatusNotFound, request("/history?group=default&model=private-unpublished").Code)
	image := request(fmt.Sprintf("/image/%d", sample.ID))
	require.Equal(t, http.StatusOK, image.Code)
	require.Equal(t, "nosniff", image.Header().Get("X-Content-Type-Options"))
	require.Contains(t, image.Header().Get("Content-Security-Policy"), "sandbox")
	require.Contains(t, image.Header().Get("Content-Security-Policy"), "default-src 'none'")
	require.Contains(t, image.Header().Get("Content-Security-Policy"), "script-src 'none'")
	document := request(fmt.Sprintf("/document/%d", sample.ID))
	require.Equal(t, http.StatusOK, document.Code)
	require.Contains(t, document.Header().Get("Content-Type"), "application/json")
	require.Contains(t, document.Body.String(), `"format":"svg"`)
	require.Equal(t, http.StatusUnauthorized, request(fmt.Sprintf("/admin/document/%d", sample.ID)).Code)
	require.NoError(t, db.Model(sample).Update("prompt_version", model.PelicanPromptVersion).Error)
	largeHTML := strings.Replace(testPelicanHTML, "</body>", strings.Repeat("<!-- animation source -->", 4000)+"</body>", 1)
	require.NoError(t, model.FinishPelicanSample(sample, largeHTML, "", 345))
	document = request(fmt.Sprintf("/document/%d", sample.ID))
	require.Equal(t, http.StatusOK, document.Code)
	require.Equal(t, "private, no-store", document.Header().Get("Cache-Control"))
	var decoded struct {
		Data struct {
			Format string
			Source string
		}
	}
	require.NoError(t, common.Unmarshal(document.Body.Bytes(), &decoded))
	require.Equal(t, "html", decoded.Data.Format)
	require.Equal(t, largeHTML, decoded.Data.Source)
	var htmlSample model.PelicanSample
	require.NoError(t, db.First(&htmlSample, sample.ID).Error)
	reconcilePelicanSample(&htmlSample)
	require.Equal(t, "success", htmlSample.Status, "HTML must not be reclassified by the legacy SVG validator")
	require.NoError(t, db.Model(sample).Update("prompt_version", "pelican-svg-v3").Error)
	detailedSVG := `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><style>circle { fill: red; }</style><script>alert(1)</script><foreignObject><div>kept for inspection</div></foreignObject><image href="https://example.test/image.png"/><circle r="20"/></svg>`
	require.NoError(t, model.FinishPelicanSample(sample, detailedSVG, "", 345))
	image = request(fmt.Sprintf("/image/%d", sample.ID))
	require.Equal(t, http.StatusOK, image.Code)
	require.Equal(t, detailedSVG, image.Body.String(), "the published SVG must be preserved; browser execution is restricted by CSP")
	require.NoError(t, model.FinishPelicanSample(sample, testPelicanSVG, "", 345))
	for i := 1; i <= 25; i++ {
		previousSample, claimed, err := model.ClaimPelicanSample("vip", "gpt-4o-mini", now.Add(-time.Duration(i)*time.Hour))
		require.NoError(t, err)
		require.True(t, claimed)
		require.NoError(t, model.FinishPelicanSample(previousSample, "", "upstream_error", 1))
	}
	rows, err := model.QueryPelicanSamples("vip", "gpt-4o-mini", 0, 24, 7)
	require.NoError(t, err)
	require.Len(t, rows, 24)
	older, err := model.QueryPelicanSamples("vip", "gpt-4o-mini", rows[23].Hour, 24, 7)
	require.NoError(t, err)
	require.Len(t, older, 2)
	require.Less(t, older[0].Hour, rows[23].Hour)
	oldSample, _, err := model.ClaimPelicanSample("vip", "gpt-4o-mini", now.Add(-8*24*time.Hour))
	require.NoError(t, err)
	require.NoError(t, model.CleanupPelicanSamples(now, 7))
	var n int64
	require.NoError(t, db.Model(&model.PelicanSample{}).Where("id = ?", oldSample.ID).Count(&n).Error)
	require.Zero(t, n)
	require.NoError(t, db.Model(&model.ChannelHealthCheck{}).Count(&n).Error)
	require.Zero(t, n, "pelican samples must not become availability checks")
	config.Enabled = false
	require.NoError(t, model.SavePelicanConfig(config))
	require.Equal(t, http.StatusOK, request(fmt.Sprintf("/image/%d", sample.ID)).Code, "paused schedule preserves published history")
	config.Targets = []model.PelicanTarget{}
	require.NoError(t, model.SavePelicanConfig(config))
	require.Equal(t, http.StatusNotFound, request(fmt.Sprintf("/image/%d", sample.ID)).Code, "unpublishing must revoke image access")
	require.Equal(t, http.StatusNotFound, request(fmt.Sprintf("/document/%d", sample.ID)).Code, "unpublishing must revoke source access")
	_, err = model.PelicanDue(config, now)
	require.NoError(t, err)
	require.NoError(t, runPelicanSamples(context.Background(), func(int, int) {}), "disabled schedule must never contact an upstream")
}

func TestPelicanRunsThroughConfiguredGroupWithoutAffectingHealthOrWallet(t *testing.T) {
	setupPelicanOptions(t)
	require.NoError(t, i18n.Init())
	withTieredBillingConfig(t, map[string]string{}, map[string]string{})
	const modelName = "pelican-unpriced-model"
	previous, previousLog := model.DB, model.LOG_DB
	previousRedis, previousLogEnabled := common.RedisEnabled, common.LogConsumeEnabled
	previousStreamingTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previous, previousLog
		common.RedisEnabled, common.LogConsumeEnabled = previousRedis, previousLogEnabled
		constant.StreamingTimeout = previousStreamingTimeout
	})
	db := setupModelListControllerTestDB(t)
	common.LogConsumeEnabled = false
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.PelicanSample{}, &model.ChannelHealthCheck{}))
	user := model.User{Id: 314150, Username: "pelican-test-root", Role: common.RoleRootUser, Status: common.UserStatusEnabled, Group: "default", Quota: 1234567}
	require.NoError(t, db.Create(&user).Error)
	requests := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		require.Equal(t, "/v1/chat/completions", r.URL.Path)
		var body map[string]any
		require.NoError(t, common.DecodeJson(r.Body, &body))
		require.Equal(t, true, body["stream"])
		require.Equal(t, float64(8192), body["max_tokens"])
		require.Contains(t, body["messages"], map[string]any{"role": "user", "content": model.PelicanPrompt})
		payload, err := common.Marshal(map[string]any{"id": "sample-test", "object": "chat.completion.chunk", "model": modelName, "choices": []any{map[string]any{"index": 0, "delta": map[string]any{"role": "assistant", "content": testPelicanHTML}, "finish_reason": "stop"}}})
		require.NoError(t, err)
		w.Header().Set("Content-Type", "text/event-stream")
		// Small deltas with large SSE envelopes reproduce the >1MiB stream
		// encountered in production; reasoning must never enter the SVG.
		thinking, err := common.Marshal(map[string]any{"id": strings.Repeat("s", 80), "object": "chat.completion.chunk", "model": modelName, "choices": []any{map[string]any{"index": 0, "delta": map[string]any{"reasoning_content": "r"}}}})
		require.NoError(t, err)
		for range 8000 {
			_, _ = fmt.Fprintf(w, "data: %s\n\n", thinking)
		}
		_, _ = fmt.Fprintf(w, "data: %s\n\ndata: [DONE]\n\n", payload)
	}))
	t.Cleanup(upstream.Close)
	service.InitHttpClient()
	channel := model.Channel{Id: 314150, Type: constant.ChannelTypeOpenAI, Name: "isolated-test-upstream", Key: "isolated-not-a-real-key", BaseURL: common.GetPointer(upstream.URL), Group: "vip", Models: modelName, Status: common.ChannelStatusEnabled}
	require.NoError(t, db.Create(&channel).Error)
	require.NoError(t, db.Create(&model.Ability{Group: "vip", Model: modelName, ChannelId: channel.Id, Enabled: true}).Error)
	ordinaryTest := testChannel(context.Background(), &channel, user.Id, modelName, "", false)
	require.NotNil(t, ordinaryTest.newAPIError)
	require.Equal(t, "model_price_error", string(ordinaryTest.newAPIError.GetErrorCode()), "ordinary model testing must keep its pricing check")
	require.Zero(t, requests, "a pricing failure happens before any upstream call")
	config := model.PelicanConfig{Enabled: true, PublicEnabled: true, RetentionDays: 7, Targets: []model.PelicanTarget{{Group: "vip", Models: []string{modelName}}}}
	require.NoError(t, model.SavePelicanConfig(config))
	require.NoError(t, runPelicanSamples(context.Background(), func(int, int) {}))
	require.Equal(t, 1, requests)
	rows, err := model.QueryPelicanSamples("vip", modelName, 0, 24, 7)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, "success", rows[0].Status)
	require.NoError(t, runPelicanSamples(context.Background(), func(int, int) {}))
	require.Equal(t, 1, requests, "manual repeats must reuse the current hourly sample")
	require.NoError(t, runPelicanSamplesWithRetry(context.Background(), func(int, int) {}, time.Now().Unix()))
	require.Equal(t, 1, requests, "explicit retries must still skip successful samples")
	var healthCount int64
	require.NoError(t, db.Model(&model.ChannelHealthCheck{}).Count(&healthCount).Error)
	require.Zero(t, healthCount)
	var unchanged model.User
	require.NoError(t, db.First(&unchanged, user.Id).Error)
	require.Equal(t, user.Quota, unchanged.Quota)
	var unchangedChannel model.Channel
	require.NoError(t, db.First(&unchangedChannel, channel.Id).Error)
	require.Equal(t, common.ChannelStatusEnabled, unchangedChannel.Status)
}

func TestPelicanFailuresExposeOnlySafeCategories(t *testing.T) {
	for _, tc := range []struct {
		code types.ErrorCode
		want string
	}{
		{types.ErrorCodeModelPriceError, "pricing_error"},
		{types.ErrorCodeInvalidRequest, "request_configuration_error"},
		{types.ErrorCodeDoRequestFailed, "connection_error"},
		{types.ErrorCodeBadResponse, "upstream_http_error"},
		{types.ErrorCodeBadResponseBody, "response_error"},
		{types.ErrorCodeChannelNoAvailableKey, "no_channel"},
		{types.ErrorCode("arbitrary upstream secret"), "upstream_error"},
	} {
		t.Run(tc.want+"/"+string(tc.code), func(t *testing.T) {
			result := testResult{newAPIError: types.NewError(errors.New("sensitive provider message"), tc.code)}
			require.Equal(t, tc.want, pelicanFailureCode(context.Background(), result))
		})
	}
	require.Equal(t, "timeout", pelicanFailureCode(context.Background(), testResult{localErr: context.DeadlineExceeded}))
	require.Equal(t, "output_too_large", pelicanFailureCode(context.Background(), testResult{localErr: errors.New("output_too_large")}))
}
