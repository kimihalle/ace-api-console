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
package model

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const PelicanOptionKey = "PelicanSampleConfig"
const PelicanPromptVersion = "pelican-html-v1"

// Wait for the five-minute upstream timeout and a grace period before marking a run interrupted.
const PelicanSampleStaleAfter = 6 * time.Minute
const PelicanPrompt = "Create a beautiful, continuously animated HTML card showing a pelican riding a bicycle. Animate the rotating wheels, pedaling legs and moving scenery using inline CSS and/or JavaScript. Return one complete, self-contained HTML document with <!DOCTYPE html>, <html>, <head>, and <body>, with no explanation outside it. Use a responsive layout that fits its iframe viewport without clipping. All code and artwork must be inline: no external libraries, images, fonts, network requests, links or navigation. SVG or canvas may be used inside the HTML, but the final result must be an animated HTML page, not a standalone SVG."

type PelicanTarget struct {
	Group  string   `json:"group"`
	Models []string `json:"models"`
}

type PelicanConfig struct {
	Enabled       bool            `json:"enabled"`
	PublicEnabled bool            `json:"public_enabled"`
	RetentionDays int             `json:"retention_days"`
	Targets       []PelicanTarget `json:"targets"`
}

// This history is deliberately independent of channel availability and user usage.
type PelicanSample struct {
	ID            int64  `json:"id" gorm:"primaryKey"`
	TargetKey     string `json:"-" gorm:"type:varchar(64);uniqueIndex:idx_pelican_target_hour"`
	Hour          int64  `json:"hour" gorm:"bigint;uniqueIndex:idx_pelican_target_hour;index"`
	RouteGroup    string `json:"group" gorm:"type:varchar(64)"`
	ModelName     string `json:"model" gorm:"type:varchar(255)"`
	CheckedAt     int64  `json:"checked_at" gorm:"bigint"`
	LatencyMs     int64  `json:"latency_ms" gorm:"bigint"`
	Status        string `json:"status" gorm:"type:varchar(32)"`
	ErrorCode     string `json:"error_code" gorm:"type:varchar(64)"`
	PromptVersion string `json:"prompt_version" gorm:"type:varchar(32)"`
	// The existing column stores legacy SVG or HTML source, identified by PromptVersion.
	SVG string `json:"-" gorm:"size:1048576"`
}

func PelicanTargetKey(group, model string) string {
	return fmt.Sprintf("%x", sha256.Sum256([]byte(group+"\x00"+model)))
}

func (config *PelicanConfig) Validate() error {
	if config.Targets == nil {
		config.Targets = []PelicanTarget{}
	}
	if config.RetentionDays < 1 || config.RetentionDays > 30 {
		return errors.New("Pelican retention must be between 1 and 30 days")
	}
	count := 0
	groups := map[string]bool{}
	for i := range config.Targets {
		target := &config.Targets[i]
		target.Group = strings.TrimSpace(target.Group)
		if target.Group == "" || target.Group == "auto" || len(target.Group) > 64 || groups[target.Group] || len(target.Models) == 0 {
			return errors.New("Invalid or duplicate pelican group")
		}
		groups[target.Group] = true
		seen := map[string]bool{}
		for j, name := range target.Models {
			name = strings.TrimSpace(name)
			if name == "" || len(name) > 255 || seen[name] {
				return errors.New("Invalid or duplicate pelican model")
			}
			target.Models[j] = name
			seen[name] = true
			count++
		}
	}
	if count > 20 || (config.Enabled && count == 0) {
		return errors.New("Choose between 1 and 20 pelican group/model pairs")
	}
	return nil
}

func GetPelicanConfig() (PelicanConfig, error) {
	config := PelicanConfig{PublicEnabled: true, RetentionDays: 7, Targets: []PelicanTarget{}}
	var option Option
	err := DB.Where(Option{Key: PelicanOptionKey}).First(&option).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return config, nil
	}
	if err != nil {
		return config, err
	}
	if err = common.UnmarshalJsonStr(option.Value, &config); err != nil {
		return config, err
	}
	err = config.Validate()
	return config, err
}

func SavePelicanConfig(config PelicanConfig) error {
	if err := config.Validate(); err != nil {
		return err
	}
	catalog, err := PelicanAvailableTargets()
	if err != nil {
		return err
	}
	for _, target := range config.Targets {
		for _, name := range target.Models {
			if !slices.Contains(catalog[target.Group], name) {
				return errors.New("Selected pelican model is not enabled in that group")
			}
		}
	}
	data, err := common.Marshal(config)
	if err != nil {
		return err
	}
	return UpdateOptionsBulk(map[string]string{PelicanOptionKey: string(data)})
}

func PelicanAvailableTargets() (map[string][]string, error) {
	var abilities []Ability
	if err := DB.Table("abilities").Select("abilities.*").Joins("JOIN channels ON channels.id = abilities.channel_id").Where("abilities.enabled = ? AND channels.status = ?", true, common.ChannelStatusEnabled).Scan(&abilities).Error; err != nil {
		return nil, err
	}
	ratios := ratio_setting.GetGroupRatioCopy()
	groups := map[string][]string{}
	for _, ability := range abilities {
		if _, ok := ratios[ability.Group]; !ok || ability.Group == "auto" || !isPelicanTextModel(ability.Model) {
			continue
		}
		if !slices.Contains(groups[ability.Group], ability.Model) {
			groups[ability.Group] = append(groups[ability.Group], ability.Model)
		}
	}
	for _, names := range groups {
		slices.Sort(names)
	}
	return groups, nil
}

func isPelicanTextModel(name string) bool {
	if common.IsImageGenerationModel(name) {
		return false
	}
	name = strings.ToLower(name)
	for _, marker := range []string{"embed", "rerank", "re-rank", "whisper", "transcrib", "speech", "audio", "-tts", "tts-", "video", "sora", "midjourney", "suno", "kling", "seedream", "jimeng", "vidu", "stable-diffusion", "flux-"} {
		if strings.Contains(name, marker) {
			return false
		}
	}
	return true
}

func (config PelicanConfig) Publishes(group, name string) bool {
	for _, target := range config.Targets {
		if target.Group == group && slices.Contains(target.Models, name) {
			return true
		}
	}
	return false
}

func PelicanDue(config PelicanConfig, now time.Time) (bool, error) {
	if !config.Enabled {
		return false, nil
	}
	hour := now.Unix() / 3600 * 3600
	for _, target := range config.Targets {
		for _, name := range target.Models {
			var count int64
			if err := DB.Model(&PelicanSample{}).Where("target_key = ? AND hour = ?", PelicanTargetKey(target.Group, name), hour).Count(&count).Error; err != nil {
				return false, err
			}
			if count == 0 {
				return true, nil
			}
		}
	}
	return false, nil
}

// Unique target/hour claims also deduplicate manual runs, restarts and multiple nodes.
func ClaimPelicanSample(group, name string, now time.Time) (*PelicanSample, bool, error) {
	sample := &PelicanSample{TargetKey: PelicanTargetKey(group, name), Hour: now.Unix() / 3600 * 3600, RouteGroup: group, ModelName: name, CheckedAt: now.Unix(), Status: "running", PromptVersion: PelicanPromptVersion}
	result := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(sample)
	return sample, result.RowsAffected == 1, result.Error
}

// Explicit manual runs may replace a failed current-hour attempt, but must not
// race a running/successful attempt or retry their own newly recorded failure.
func RetryFailedPelicanSample(group, name string, now time.Time, requestedAt int64) (*PelicanSample, bool, error) {
	hour := now.Unix() / 3600 * 3600
	if requestedAt/3600*3600 != hour {
		return nil, false, nil
	}
	key := PelicanTargetKey(group, name)
	result := DB.Model(&PelicanSample{}).
		Where("target_key = ? AND hour = ? AND status = ? AND checked_at < ?", key, hour, "failed", requestedAt).
		Updates(map[string]any{"status": "running", "error_code": "", "svg": "", "latency_ms": 0, "checked_at": now.Unix()})
	if result.Error != nil || result.RowsAffected == 0 {
		return nil, false, result.Error
	}
	var sample PelicanSample
	err := DB.Where("target_key = ? AND hour = ?", key, hour).First(&sample).Error
	return &sample, err == nil, err
}

func FinishPelicanSample(sample *PelicanSample, svg, errorCode string, latency int64) error {
	status := "success"
	if errorCode != "" {
		status = "failed"
	}
	return DB.Model(&PelicanSample{}).Where("id = ?", sample.ID).Updates(map[string]any{"svg": svg, "error_code": errorCode, "latency_ms": latency, "status": status}).Error
}

func QueryPelicanSamples(group, name string, before int64, limit int, retentionDays int) ([]PelicanSample, error) {
	rows := []PelicanSample{}
	query := DB.Omit("svg").Where("target_key = ? AND hour >= ?", PelicanTargetKey(group, name), time.Now().Unix()-int64(retentionDays)*86400)
	if before > 0 {
		query = query.Where("hour < ?", before)
	}
	err := query.Order("hour DESC").Limit(min(max(limit, 1), 48)).Find(&rows).Error
	for i := range rows {
		if rows[i].Status == "running" && rows[i].CheckedAt < time.Now().Add(-PelicanSampleStaleAfter).Unix() {
			rows[i].Status, rows[i].ErrorCode = "failed", "interrupted"
		}
	}
	return rows, err
}

func QueryPelicanSamplesAdmin(group, name string, before int64, limit int, status string) ([]PelicanSample, error) {
	rows := []PelicanSample{}
	query := DB.Omit("svg").Order("id DESC")
	if group != "" {
		query = query.Where("route_group = ?", group)
	}
	if name != "" {
		query = query.Where("model_name = ?", name)
	}
	if before > 0 {
		query = query.Where("id < ?", before)
	}
	switch status {
	case "success":
		query = query.Where("status = ?", "success")
	case "failed":
		query = query.Where("(status = ? OR (status = ? AND checked_at < ?))", "failed", "running", time.Now().Add(-PelicanSampleStaleAfter).Unix())
	}
	err := query.Limit(min(max(limit, 1), 100)).Find(&rows).Error
	for i := range rows {
		if rows[i].Status == "running" && rows[i].CheckedAt < time.Now().Add(-PelicanSampleStaleAfter).Unix() {
			rows[i].Status, rows[i].ErrorCode = "failed", "interrupted"
		}
	}
	return rows, err
}

func DeletePelicanSample(id int64) (bool, error) {
	result := DB.Delete(&PelicanSample{}, id)
	return result.RowsAffected > 0, result.Error
}

// Batch deletion is always restricted to the IDs explicitly selected by an administrator.
func BatchDeletePelicanSamples(ids []int64) (int64, error) {
	if len(ids) == 0 || len(ids) > 1000 {
		return 0, errors.New("Invalid record selection")
	}
	for _, id := range ids {
		if id <= 0 {
			return 0, errors.New("Invalid record selection")
		}
	}
	result := DB.Where("id IN ?", ids).
		Where("(status IN ? OR (status = ? AND checked_at < ?))", []string{"success", "failed"}, "running", time.Now().Add(-PelicanSampleStaleAfter).Unix()).
		Delete(&PelicanSample{})
	return result.RowsAffected, result.Error
}

func CleanupPelicanSamples(now time.Time, days int) error {
	return DB.Where("hour < ?", now.Unix()-int64(days)*86400).Delete(&PelicanSample{}).Error
}
