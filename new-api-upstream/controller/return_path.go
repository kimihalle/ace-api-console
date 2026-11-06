package controller

import (
	"net"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

func paymentReturnPath(suffix string) string {
	base := strings.TrimRight(strings.TrimSpace(system_setting.ServerAddress), "/")
	parsed, err := url.Parse(base)
	// Older deployments configured SITE_URL and the notification URL but left
	// ServerAddress at localhost. Use configured origins, never request headers.
	if err == nil && (base == "" || strings.EqualFold(parsed.Hostname(), "localhost") || net.ParseIP(parsed.Hostname()).IsLoopback()) {
		candidates := append([]string{}, common.SessionCookieTrustedURLs...)
		candidates = append(candidates, operation_setting.CustomCallbackAddress)
		for _, candidate := range candidates {
			origin, err := common.NormalizeOrigin(candidate)
			if err != nil {
				continue
			}
			u, _ := url.Parse(origin)
			if strings.EqualFold(u.Hostname(), "localhost") || net.ParseIP(u.Hostname()).IsLoopback() {
				continue
			}
			base = origin
			break
		}
	}
	return base + suffix
}
