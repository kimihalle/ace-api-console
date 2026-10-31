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
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// Channel parameter overrides still apply, but cannot increase a sample's budget.
func limitPelicanRequestTokens(body []byte) ([]byte, error) {
	var value any
	if err := common.Unmarshal(body, &value); err != nil {
		return nil, err
	}
	if !forcePelicanPrompt(value) {
		return nil, errors.New("unsupported_sample_request")
	}
	limited, err := capPelicanTokenFields(value)
	if err != nil {
		return nil, err
	}
	if !limited {
		return nil, errors.New("missing sample output limit")
	}
	return common.Marshal(value)
}

func forcePelicanPrompt(value any) bool {
	root, ok := value.(map[string]any)
	if !ok {
		return false
	}
	found := false
	if messages, ok := root["messages"].([]any); ok {
		for _, item := range messages {
			message, ok := item.(map[string]any)
			if ok && message["role"] == "user" {
				message["content"] = model.PelicanPrompt
				found = true
			}
		}
	}
	if contents, ok := root["contents"].([]any); ok {
		for _, item := range contents {
			content, ok := item.(map[string]any)
			if !ok || (content["role"] != nil && content["role"] != "user") {
				continue
			}
			content["parts"] = []any{map[string]any{"text": model.PelicanPrompt}}
			found = true
		}
	}
	switch input := root["input"].(type) {
	case string:
		root["input"] = model.PelicanPrompt
		found = true
	case []any:
		for _, item := range input {
			message, ok := item.(map[string]any)
			if ok && message["role"] == "user" {
				message["content"] = model.PelicanPrompt
				found = true
			}
		}
	}
	if _, ok := root["prompt"].(string); ok {
		root["prompt"] = model.PelicanPrompt
		found = true
	}
	return found
}

func capPelicanTokenFields(value any) (bool, error) {
	limited := false
	switch node := value.(type) {
	case map[string]any:
		for key, child := range node {
			switch strings.ToLower(strings.ReplaceAll(key, "_", "")) {
			case "maxtokens", "maxoutputtokens", "maxcompletiontokens", "maxnewtokens":
				limited = true
				if child == nil {
					node[key] = 8192
					continue
				}
				count, ok := child.(float64)
				if !ok || count <= 0 {
					return false, errors.New("invalid sample output limit")
				}
				node[key] = 8192
			default:
				found, err := capPelicanTokenFields(child)
				if err != nil {
					return false, err
				}
				limited = limited || found
			}
		}
	case []any:
		for _, child := range node {
			found, err := capPelicanTokenFields(child)
			if err != nil {
				return false, err
			}
			limited = limited || found
		}
	}
	return limited, nil
}

func GetPelicanSettings(c *gin.Context) {
	config, err := model.GetPelicanConfig()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	catalog, err := model.PelicanAvailableTargets()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"config": config, "available": catalog, "prompt": model.PelicanPrompt, "prompt_version": model.PelicanPromptVersion, "interval_seconds": 3600}})
}

func UpdatePelicanSettings(c *gin.Context) {
	var config model.PelicanConfig
	if err := common.DecodeJson(io.LimitReader(c.Request.Body, 32769), &config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid pelican configuration"})
		return
	}
	if err := model.SavePelicanConfig(config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": config})
}

func RunPelicanSamples(c *gin.Context) {
	config, err := model.GetPelicanConfig()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !config.Enabled {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Enable pelican sampling before running"})
		return
	}
	task, created, err := service.EnqueueSystemTask(model.SystemTaskTypePelican, pelicanTaskPayload{RetryRequestedAt: time.Now().Unix()})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"task_id": task.TaskID, "created": created}})
}

func GetPelicanCatalog(c *gin.Context) {
	config, err := model.GetPelicanConfig()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	targets := []gin.H{}
	for _, target := range config.Targets {
		if !config.PublicEnabled {
			break
		}
		for _, name := range target.Models {
			rows, err := model.QueryPelicanSamples(target.Group, name, 0, 1, config.RetentionDays)
			if err != nil {
				common.ApiError(c, err)
				return
			}
			var latest *model.PelicanSample
			if len(rows) > 0 {
				reconcilePelicanSample(&rows[0])
				latest = &rows[0]
			}
			targets = append(targets, gin.H{"group": target.Group, "model": name, "latest": latest})
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"enabled": config.Enabled, "public_enabled": config.PublicEnabled, "targets": targets, "prompt": model.PelicanPrompt, "prompt_version": model.PelicanPromptVersion, "interval_seconds": 3600, "retention_days": config.RetentionDays}})
}

func GetPelicanHistory(c *gin.Context) {
	config, err := model.GetPelicanConfig()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !config.PublicEnabled {
		c.Status(http.StatusNotFound)
		return
	}
	group, name := c.Query("group"), c.Query("model")
	if !config.Publishes(group, name) {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Pelican target is not published"})
		return
	}
	before, err := strconv.ParseInt(c.DefaultQuery("before", "0"), 10, 64)
	if err != nil || before < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid history cursor"})
		return
	}
	rows, err := model.QueryPelicanSamples(group, name, before, 24, config.RetentionDays)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var next int64
	if len(rows) == 24 {
		next = rows[len(rows)-1].Hour
	}
	for i := range rows {
		reconcilePelicanSample(&rows[i])
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"records": rows, "next_before": next}})
}

// Older deployments could persist a truncated SVG as success. Reconcile those
// rows when they are read so public history never advertises an unrenderable image.
func reconcilePelicanSample(sample *model.PelicanSample) {
	if sample == nil || sample.Status != "success" {
		return
	}
	var stored struct {
		SVG string
	}
	if err := model.DB.Model(&model.PelicanSample{}).Select("svg").Where("id = ?", sample.ID).First(&stored).Error; err != nil {
		return
	}
	var err error
	if strings.HasPrefix(sample.PromptVersion, "pelican-html-") {
		_, err = service.ExtractPelicanHTML(stored.SVG)
	} else {
		_, err = service.ExtractPelicanSVG(stored.SVG)
	}
	if err == nil {
		return
	}
	sample.Status = "failed"
	sample.ErrorCode = "invalid_svg"
	if strings.HasPrefix(sample.PromptVersion, "pelican-html-") {
		sample.ErrorCode = "invalid_html"
	}
	_ = model.DB.Model(&model.PelicanSample{}).Where("id = ? AND status = ?", sample.ID, "success").Updates(map[string]any{"status": "failed", "error_code": sample.ErrorCode}).Error
}

func GetPelicanDocument(c *gin.Context)      { getPelicanDocument(c, false) }
func GetPelicanAdminDocument(c *gin.Context) { getPelicanDocument(c, true) }

// JSON is data, never an executable response under the authenticated origin.
// Rendering is confined to the verified opaque iframe in each frontend.
func getPelicanDocument(c *gin.Context, admin bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id < 1 {
		c.Status(http.StatusNotFound)
		return
	}
	var sample model.PelicanSample
	if model.DB.First(&sample, id).Error != nil || sample.Status != "success" {
		c.Status(http.StatusNotFound)
		return
	}
	if !admin {
		config, err := model.GetPelicanConfig()
		if err != nil {
			c.Status(http.StatusServiceUnavailable)
			return
		}
		if !config.PublicEnabled || !config.Publishes(sample.RouteGroup, sample.ModelName) || sample.Hour < time.Now().Unix()-int64(config.RetentionDays)*86400 {
			c.Status(http.StatusNotFound)
			return
		}
	}
	format := "svg"
	var source string
	if strings.HasPrefix(sample.PromptVersion, "pelican-html-") {
		format = "html"
		source, err = service.ExtractPelicanHTML(sample.SVG)
	} else {
		source, err = service.ExtractPelicanSVG(sample.SVG)
	}
	if err != nil {
		c.Status(http.StatusUnprocessableEntity)
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"format": format, "source": source}})
}

func GetPelicanImage(c *gin.Context) {
	config, err := model.GetPelicanConfig()
	if err != nil {
		c.Status(http.StatusServiceUnavailable)
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id < 1 {
		c.Status(http.StatusNotFound)
		return
	}
	var sample model.PelicanSample
	if model.DB.First(&sample, id).Error != nil || !config.PublicEnabled || !config.Publishes(sample.RouteGroup, sample.ModelName) || sample.Status != "success" || sample.Hour < time.Now().Unix()-int64(config.RetentionDays)*86400 {
		c.Status(http.StatusNotFound)
		return
	}
	// Revalidate even persisted data before publishing under the application origin.
	svg, err := service.ExtractPelicanSVG(sample.SVG)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	c.Header("Content-Security-Policy", "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Disposition", "inline; filename=pelican.svg")
	c.Header("Cache-Control", "private, no-store")
	c.Data(http.StatusOK, "image/svg+xml; charset=utf-8", []byte(svg))
}

func GetPelicanAdminSamples(c *gin.Context) {
	group, name := strings.TrimSpace(c.Query("group")), strings.TrimSpace(c.Query("model"))
	status := c.DefaultQuery("status", "all")
	if status != "all" && status != "success" && status != "failed" {
		common.ApiErrorMsg(c, "Invalid record status")
		return
	}
	before, err := strconv.ParseInt(c.DefaultQuery("before", "0"), 10, 64)
	if err != nil || before < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid records cursor"})
		return
	}
	limit, err := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if err != nil || limit < 1 || limit > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid records limit"})
		return
	}
	rows, err := model.QueryPelicanSamplesAdmin(group, name, before, limit, status)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var next int64
	if len(rows) == limit {
		next = rows[len(rows)-1].ID
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"records": rows, "next_before": next}})
}

func DeletePelicanSample(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id < 1 {
		c.Status(http.StatusNotFound)
		return
	}
	deleted, err := model.DeletePelicanSample(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !deleted {
		c.Status(http.StatusNotFound)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"id": id}})
}

func BatchDeletePelicanSamples(c *gin.Context) {
	if c.GetInt("role") < common.RoleAdminUser {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Permission denied"})
		return
	}
	var request struct {
		IDs []int64 `json:"ids"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		common.ApiErrorMsg(c, "Invalid record selection")
		return
	}
	deleted, err := model.BatchDeletePelicanSamples(request.IDs)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"deleted": deleted}})
}

func GetPelicanAdminImage(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id < 1 {
		c.Status(http.StatusNotFound)
		return
	}
	var sample model.PelicanSample
	if model.DB.First(&sample, id).Error != nil || sample.Status != "success" {
		c.Status(http.StatusNotFound)
		return
	}
	svg, err := service.ExtractPelicanSVG(sample.SVG)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	c.Header("Content-Security-Policy", "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Disposition", "inline; filename=pelican.svg")
	c.Header("Cache-Control", "private, no-store")
	c.Data(http.StatusOK, "image/svg+xml; charset=utf-8", []byte(svg))
}

type pelicanTaskHandler struct{}

func (pelicanTaskHandler) Type() string            { return model.SystemTaskTypePelican }
func (pelicanTaskHandler) Interval() time.Duration { return 15 * time.Second }
func (pelicanTaskHandler) NewPayload() any         { return nil }
func (pelicanTaskHandler) Enabled() bool {
	config, err := model.GetPelicanConfig()
	if err != nil {
		return false
	}
	due, err := model.PelicanDue(config, time.Now())
	return err == nil && due
}

type pelicanTaskPayload struct {
	RetryRequestedAt int64 `json:"retry_requested_at,omitempty"`
}

func (pelicanTaskHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	var payload pelicanTaskPayload
	err := task.DecodePayload(&payload)
	if err == nil {
		err = runPelicanSamplesWithRetry(ctx, service.NewSystemTaskProgressReporter(task, runnerID), payload.RetryRequestedAt)
	}
	status := model.SystemTaskStatusSucceeded
	if err != nil {
		status = model.SystemTaskStatusFailed
	}
	finishSystemTaskHandler(task, runnerID, status, nil, err)
}

func runPelicanSamples(ctx context.Context, report func(int, int)) error {
	return runPelicanSamplesWithRetry(ctx, report, 0)
}

func runPelicanSamplesWithRetry(ctx context.Context, report func(int, int), retryRequestedAt int64) error {
	config, err := model.GetPelicanConfig()
	if err != nil || !config.Enabled {
		return err
	}
	if err := model.CleanupPelicanSamples(time.Now(), config.RetentionDays); err != nil {
		return err
	}
	userID, err := resolveChannelTestUserID(nil)
	if err != nil {
		return err
	}
	count, processed := 0, 0
	for _, target := range config.Targets {
		count += len(target.Models)
	}
	for _, target := range config.Targets {
		for _, name := range target.Models {
			if err := ctx.Err(); err != nil {
				return err
			}
			// Recheck live settings so disabling/removing a target stops a queued run.
			live, err := model.GetPelicanConfig()
			if err != nil || !live.Enabled {
				return err
			}
			if !live.Publishes(target.Group, name) {
				continue
			}
			now := time.Now()
			sample, claimed, err := model.ClaimPelicanSample(target.Group, name, now)
			if err != nil {
				return err
			}
			if !claimed && retryRequestedAt > 0 {
				sample, claimed, err = model.RetryFailedPelicanSample(target.Group, name, now, retryRequestedAt)
				if err != nil {
					return err
				}
			}
			if claimed {
				started := time.Now()
				svg, code := "", "upstream_error"
				channel, channelErr := model.GetChannel(target.Group, name, 0, nil)
				if channelErr == nil && channel != nil && channel.Status == common.ChannelStatusEnabled {
					requestCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
					// Long illustrations can exceed a provider's non-stream timeout.
					stream := channel.Type == constant.ChannelTypeOpenAI || shouldUseStreamForAutomaticChannelTest(channel)
					result := testChannelWithSample(requestCtx, channel, userID, name, "", stream, &channelTestSampleOptions{Group: target.Group})
					svg, code = pelicanSampleOutput(requestCtx, result, stream)
					cancel()
				} else {
					code = "no_channel"
				}
				if code != "" {
					// Log only controlled categories, never provider messages or keys.
					common.SysError(fmt.Sprintf("pelican sampling failed: sample_id=%d code=%s", sample.ID, code))
				}
				if err := model.FinishPelicanSample(sample, svg, code, time.Since(started).Milliseconds()); err != nil {
					return err
				}
			}
			processed++
			report(processed, count)
		}
	}
	return nil
}

func pelicanSampleOutput(ctx context.Context, result testResult, stream bool) (string, string) {
	if code := pelicanFailureCode(ctx, result); code != "" {
		return "", code
	}
	svg, err := service.ExtractPelicanHTML(service.PelicanResponseText(result.responseBody, stream))
	if err != nil {
		return "", err.Error()
	}
	return svg, ""
}

// Only controlled categories are persisted and exposed to public history.
func pelicanFailureCode(ctx context.Context, result testResult) string {
	if ctx.Err() != nil || errors.Is(result.localErr, context.DeadlineExceeded) {
		return "timeout"
	}
	if result.localErr != nil && result.localErr.Error() == "output_too_large" {
		return "output_too_large"
	}
	if result.localErr == nil && result.newAPIError == nil {
		return ""
	}
	if result.newAPIError == nil {
		return "internal_error"
	}
	switch result.newAPIError.GetErrorCode() {
	case types.ErrorCodeModelPriceError:
		return "pricing_error"
	case types.ErrorCodeInvalidRequest, types.ErrorCodeConvertRequestFailed, types.ErrorCodeInvalidApiType,
		types.ErrorCodeChannelParamOverrideInvalid, types.ErrorCodeChannelHeaderOverrideInvalid, types.ErrorCodeChannelModelMappedError:
		return "request_configuration_error"
	case types.ErrorCodeChannelNoAvailableKey, types.ErrorCodeChannelInvalidKey:
		return "no_channel"
	case types.ErrorCodeDoRequestFailed:
		return "connection_error"
	case types.ErrorCodeBadResponse, types.ErrorCodeBadResponseStatusCode:
		return "upstream_http_error"
	case types.ErrorCodeReadResponseBodyFailed, types.ErrorCodeBadResponseBody, types.ErrorCodeEmptyResponse:
		return "response_error"
	default:
		return "upstream_error"
	}
}
