package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/stretchr/testify/assert"
)

func TestPaymentReturnPathUsesDefaultDashboardRoutes(t *testing.T) {
	previousAddress := system_setting.ServerAddress
	system_setting.ServerAddress = "https://dashboard.example.com/"
	t.Cleanup(func() { system_setting.ServerAddress = previousAddress })

	assert.Equal(
		t,
		"https://dashboard.example.com/wallet?pay=success",
		paymentReturnPath("/wallet?pay=success"),
	)
	assert.Equal(
		t,
		"https://dashboard.example.com/usage-logs",
		paymentReturnPath("/usage-logs"),
	)
}

func TestPaymentReturnPathFallsBackOnlyForUnconfiguredOrLocalAddress(t *testing.T) {
	previousAddress, previousCallback, previousTrusted := system_setting.ServerAddress, operation_setting.CustomCallbackAddress, common.SessionCookieTrustedURLs
	t.Cleanup(func() {
		system_setting.ServerAddress, operation_setting.CustomCallbackAddress, common.SessionCookieTrustedURLs = previousAddress, previousCallback, previousTrusted
	})
	for _, tc := range []struct {
		address        string
		trusted        []string
		callback, want string
	}{
		{"http://localhost:3000", []string{"https://shop.example.test"}, "https://notify.example.test", "https://shop.example.test/console/plans"},
		{"http://127.0.0.1:3000", nil, "https://shop.example.test", "https://shop.example.test/console/plans"},
		{"http://[::1]:3000", []string{"https://shop.example.test"}, "", "https://shop.example.test/console/plans"},
		{"", []string{"https://shop.example.test"}, "", "https://shop.example.test/console/plans"},
		{"https://dashboard.example.test/", []string{"https://shop.example.test"}, "https://notify.example.test", "https://dashboard.example.test/console/plans"},
		{"http://localhost:3000", nil, "", "http://localhost:3000/console/plans"},
		{"http://localhost:3000", []string{"https://user:password@shop.example.test", "https://shop.example.test?bad=1"}, "", "http://localhost:3000/console/plans"},
	} {
		system_setting.ServerAddress, common.SessionCookieTrustedURLs, operation_setting.CustomCallbackAddress = tc.address, tc.trusted, tc.callback
		assert.Equal(t, tc.want, paymentReturnPath("/console/plans"))
	}
}
