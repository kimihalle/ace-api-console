package controller

import (
	"bytes"
	"crypto/hmac"
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

// Scanners may add tracking parameters or re-encode a URL before opening it.
// Keep Epay's MD5 fields out of the scanned query; send them in a POST form.
// This bearer link only opens payment, never reads a redemption code or settles
// an order. Repeated scans are allowed while the original order is pending.
func storeEpayCheckoutURL(tradeNo string) string {
	signature := common.GenerateHMAC("store-epay-checkout:v1:" + tradeNo)
	return paymentReturnPath("/api/user/store/checkout/" + url.PathEscape(tradeNo) + "/" + signature)
}

var storeEpayCheckoutTemplate = template.Must(template.New("store-epay-checkout").Parse(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>{{.Title}}</title>
<style nonce="{{.Nonce}}">body{margin:0;background:#f8fafb;color:#263544;font:16px system-ui,sans-serif;min-height:100vh;display:grid;place-items:center}main{max-width:420px;padding:32px;text-align:center}h1{font-size:22px}p{line-height:1.7;color:#64748b}button{padding:12px 24px;border:0;border-radius:8px;background:#c76b4d;color:white;font:inherit;cursor:pointer}</style></head>
<body><main><h1>{{.Title}}</h1><p>{{.Hint}}</p><form id="checkout" method="post" accept-charset="UTF-8" action="{{.Action}}">
{{range $name, $value := .Fields}}<input type="hidden" name="{{$name}}" value="{{$value}}">{{end}}
<button type="submit">{{.Continue}}</button></form></main>
<script nonce="{{.Nonce}}">document.getElementById('checkout').submit();</script></body></html>`))

func GetStoreEpayCheckout(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("Referrer-Policy", "no-referrer")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("X-Frame-Options", "DENY")
	tradeNo, signature := c.Param("trade_no"), c.Param("signature")
	expected := common.GenerateHMAC("store-epay-checkout:v1:" + tradeNo)
	if len(tradeNo) == 0 || len(tradeNo) > 64 || !hmac.Equal([]byte(signature), []byte(expected)) {
		c.String(http.StatusNotFound, "%s", i18n.T(c, "payment.checkout_unavailable"))
		return
	}
	var order model.TopUp
	if err := model.DB.Where("trade_no = ?", tradeNo).First(&order).Error; err != nil {
		c.String(http.StatusNotFound, "%s", i18n.T(c, "payment.checkout_unavailable"))
		return
	}
	if order.PaymentProvider != model.PaymentProviderEpay || order.DeliveryMode == "" || order.Status != common.TopUpStatusPending || order.CreateTime < time.Now().Add(-30*time.Minute).Unix() {
		c.String(http.StatusGone, "%s", i18n.T(c, "payment.checkout_unavailable"))
		return
	}
	client := GetEpayClient()
	if client == nil || !isEpayTopUpEnabled() || !operation_setting.ContainsPayMethod(order.PaymentMethod) {
		c.String(http.StatusServiceUnavailable, "%s", i18n.T(c, "payment.checkout_unavailable"))
		return
	}
	notifyURL, notifyErr := url.Parse(service.GetCallbackAddress() + "/api/user/epay/notify")
	returnURL, returnErr := url.Parse(storeReturnURL(order.TradeNo))
	if notifyErr != nil || returnErr != nil {
		c.String(http.StatusServiceUnavailable, "%s", i18n.T(c, "payment.checkout_unavailable"))
		return
	}
	uri, fields, err := client.Purchase(&epay.PurchaseArgs{
		Type: order.PaymentMethod, ServiceTradeNo: order.TradeNo,
		Name: fmt.Sprintf("TUC%d", order.Amount), Money: strconv.FormatFloat(order.Money, 'f', 2, 64),
		Device: epay.MOBILE, NotifyUrl: notifyURL, ReturnUrl: returnURL,
	})
	if err != nil {
		c.String(http.StatusServiceUnavailable, "%s", i18n.T(c, "payment.checkout_unavailable"))
		return
	}
	endpoint, err := url.Parse(uri)
	if err != nil || endpoint.Host == "" || endpoint.User != nil || (endpoint.Scheme != "https" && endpoint.Scheme != "http") || endpoint.RawQuery != "" || endpoint.Fragment != "" {
		c.String(http.StatusServiceUnavailable, "%s", i18n.T(c, "payment.checkout_unavailable"))
		return
	}
	nonce := common.GetUUID()
	var body bytes.Buffer
	err = storeEpayCheckoutTemplate.Execute(&body, struct {
		Title, Hint, Continue, Action, Nonce string
		Fields                               map[string]string
	}{i18n.T(c, "payment.checkout_title"), i18n.T(c, "payment.checkout_hint"), i18n.T(c, "payment.checkout_continue"), uri, nonce, fields})
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	// The gateway may redirect across payment-provider origins after the POST.
	// Do not restrict form-action to the initial gateway and break that handoff.
	c.Header("Content-Security-Policy", fmt.Sprintf("default-src 'none'; script-src 'nonce-%s'; style-src 'nonce-%s'; base-uri 'none'; frame-ancestors 'none'", nonce, nonce))
	c.Data(http.StatusOK, "text/html; charset=utf-8", body.Bytes())
}
