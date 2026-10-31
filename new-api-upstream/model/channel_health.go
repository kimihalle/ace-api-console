package model

import (
	"cmp"
	"slices"
	"strings"
	"time"
)

// ChannelHealthCheck is an actual manual/scheduled probe, not a billable relay.
// No upstream credentials, URLs, response bodies or failure messages are stored.
type ChannelHealthCheck struct {
	ID         int64  `gorm:"primaryKey"`
	ChannelID  int    `gorm:"index"`
	RouteGroup string `gorm:"size:64;index:idx_channel_health_group_time,priority:1"`
	CheckedAt  int64  `gorm:"index:idx_channel_health_group_time,priority:2;index"`
	Success    bool
	LatencyMs  int64
}

type ChannelHealthPoint struct {
	Ts          int64   `json:"ts"`
	SuccessRate float64 `json:"success_rate"`
}

type ChannelHealthSummary struct {
	SuccessRate  float64 `json:"success_rate"`
	AvgLatencyMs int64   `json:"avg_latency_ms"`
}

type ChannelHealthResult struct {
	Source        string                `json:"source"`
	Summary       *ChannelHealthSummary `json:"summary"`
	SuccessSeries []ChannelHealthPoint  `json:"success_series"`
	WindowStart   int64                 `json:"window_start"`
	WindowEnd     int64                 `json:"window_end"`
	BucketSeconds int64                 `json:"bucket_seconds"`
	LastCheckedAt int64                 `json:"last_checked_at"`
}

func RecordChannelHealthCheck(channel *Channel, checkedAt int64, success bool, latencyMs int64) error {
	if channel == nil || channel.Id <= 0 || checkedAt <= 0 {
		return nil
	}
	groups := channel.GetGroups()
	if slices.Contains(groups, "all") {
		groups = []string{"all"}
	}
	checks := make([]ChannelHealthCheck, 0, len(groups))
	seen := make(map[string]bool, len(groups))
	for _, group := range groups {
		group = strings.TrimSpace(group)
		if group == "" || seen[group] {
			continue
		}
		seen[group] = true
		checks = append(checks, ChannelHealthCheck{ChannelID: channel.Id, RouteGroup: group, CheckedAt: checkedAt, Success: success, LatencyMs: max(0, latencyMs)})
	}
	if len(checks) == 0 {
		return nil
	}
	if err := DB.Create(&checks).Error; err != nil {
		return err
	}
	return DB.Where("checked_at < ?", checkedAt-30*24*3600).Delete(&ChannelHealthCheck{}).Error
}

func QueryChannelHealth(group string, hours int, now time.Time, configuredInterval ...int64) (ChannelHealthResult, error) {
	interval := int64(300)
	if len(configuredInterval) > 0 && configuredInterval[0] > 0 {
		interval = configuredInterval[0]
	}
	hours = min(24, max(1, hours))
	end := now.Unix()
	bucketCount := (int64(hours*3600) + interval - 1) / interval
	start := end - end%interval - (bucketCount-1)*interval
	result := ChannelHealthResult{Source: "channel_checks", WindowStart: start, WindowEnd: end, BucketSeconds: interval, SuccessSeries: []ChannelHealthPoint{}}
	if strings.TrimSpace(group) == "" {
		return result, nil
	}
	var checks []ChannelHealthCheck
	if err := DB.Where("route_group IN ? AND checked_at >= ? AND checked_at <= ?", []string{group, "all"}, start, end).Find(&checks).Error; err != nil {
		return result, err
	}
	type counts struct{ total, passed, latency int64 }
	buckets := map[int64]counts{}
	var total counts
	for _, check := range checks {
		bucket := check.CheckedAt - check.CheckedAt%interval
		count := buckets[bucket]
		count.total++
		total.total++
		count.latency += check.LatencyMs
		total.latency += check.LatencyMs
		if check.Success {
			count.passed++
			total.passed++
		}
		buckets[bucket] = count
		result.LastCheckedAt = max(result.LastCheckedAt, check.CheckedAt)
	}
	if total.total > 0 {
		result.Summary = &ChannelHealthSummary{SuccessRate: float64(total.passed) * 100 / float64(total.total), AvgLatencyMs: total.latency / total.total}
	}
	for ts, count := range buckets {
		result.SuccessSeries = append(result.SuccessSeries, ChannelHealthPoint{Ts: ts, SuccessRate: float64(count.passed) * 100 / float64(count.total)})
	}
	slices.SortFunc(result.SuccessSeries, func(a, b ChannelHealthPoint) int { return cmp.Compare(a.Ts, b.Ts) })
	return result, nil
}
