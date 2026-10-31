package controller

import (
	"bytes"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

type storePayment struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Provider  string `json:"provider"`
	Money     string `json:"money"`
	Currency  string `json:"currency"`
	Quota     int    `json:"quota"`
	Estimated bool   `json:"estimated"`
}

type storeProduct struct {
	ID        string         `json:"id"`
	Name      string         `json:"name,omitempty"`
	Amount    int64          `json:"amount"`
	ProductID string         `json:"-"`
	Payments  []storePayment `json:"payments"`
}

func storeReturnURL(tradeNo string) string {
	return paymentReturnPath("/console/plans?order=" + url.QueryEscape(tradeNo))
}

func storeDeliveryModes() []string {
	switch operation_setting.GetPaymentSetting().StoreDeliveryMode {
	case model.TopUpDeliveryBalance:
		return []string{model.TopUpDeliveryBalance}
	case model.TopUpDeliveryRedemption:
		return []string{model.TopUpDeliveryRedemption}
	default:
		return []string{model.TopUpDeliveryBalance, model.TopUpDeliveryRedemption}
	}
}

// Quotes use the same configured prices, discounts and quota conversions as
// each existing gateway. Neither payment prices nor quota come from the client.
func storeProducts(group string) []storeProduct {
	products := []storeProduct{}
	seen := make(map[string]bool)
	for _, amount := range operation_setting.GetPaymentSetting().AmountOptions {
		id := fmt.Sprintf("amount:%d", amount)
		if amount <= 0 || seen[id] {
			continue
		}
		seen[id] = true
		product := storeProduct{ID: id, Amount: int64(amount), Payments: []storePayment{}}
		quota, err := validateTopUpQuota(int64(amount))
		if err != nil {
			continue
		}
		if isEpayTopUpEnabled() && int64(amount) >= getMinTopup() {
			money := getPayMoney(int64(amount), group)
			if money >= .01 && !math.IsInf(money, 0) && !math.IsNaN(money) {
				seenMethods := make(map[string]bool)
				for _, method := range operation_setting.PayMethods {
					kind := method["type"]
					if kind == "" || seenMethods[kind] || kind == "stripe" || kind == "creem" || kind == "waffo" || kind == "waffo_pancake" {
						continue
					}
					if minimum, e := strconv.ParseInt(method["min_topup"], 10, 64); e == nil && int64(amount) < minimum {
						continue
					}
					seenMethods[kind] = true
					product.Payments = append(product.Payments, storePayment{ID: "epay:" + kind, Name: method["name"], Provider: "epay", Money: fmt.Sprintf("%.2f", money), Currency: "CNY", Quota: quota})
				}
			}
		}
		if isStripeTopUpEnabled() && int64(amount) >= getStripeMinTopup() && amount <= 10000 {
			stripeQuota, e := validateCreditedQuota(getStripeCreditedQuota(int64(amount), group))
			money := getStripePayMoney(float64(amount), group)
			if e == nil && money > .01 && !math.IsInf(money, 0) && !math.IsNaN(money) {
				// The configured Stripe Price determines the checkout currency.
				product.Payments = append(product.Payments, storePayment{ID: "stripe", Name: "Stripe", Provider: "stripe", Money: fmt.Sprintf("%.2f", money), Quota: stripeQuota, Estimated: true})
			}
		}
		if isWaffoTopUpEnabled() && amount >= setting.WaffoMinTopUp {
			money := getWaffoPayMoney(float64(amount), group)
			if money >= .01 && !math.IsInf(money, 0) && !math.IsNaN(money) {
				product.Payments = append(product.Payments, storePayment{ID: "waffo", Name: "Waffo", Provider: "waffo", Money: formatWaffoAmount(money, getWaffoCurrency()), Currency: getWaffoCurrency(), Quota: quota})
			}
		}
		if isWaffoPancakeTopUpEnabled() && amount >= setting.WaffoPancakeMinTopUp {
			money := getWaffoPancakePayMoney(int64(amount), group)
			if money >= .01 && !math.IsInf(money, 0) && !math.IsNaN(money) {
				product.Payments = append(product.Payments, storePayment{ID: "waffo_pancake", Name: "Waffo Pancake", Provider: "waffo_pancake", Money: formatWaffoPancakeAmount(money), Currency: "USD", Quota: quota})
			}
		}
		if len(product.Payments) > 0 {
			products = append(products, product)
		}
	}
	if isCreemTopUpEnabled() {
		var configured []CreemProduct
		if common.UnmarshalJsonStr(setting.CreemProducts, &configured) == nil {
			for _, item := range configured {
				id := "creem:" + item.ProductId
				quota, err := validateCreditedQuota(decimal.NewFromInt(item.Quota))
				currency := strings.ToUpper(strings.TrimSpace(item.Currency))
				if err != nil || item.ProductId == "" || seen[id] || len(currency) != 3 || strings.IndexFunc(currency, func(r rune) bool { return r < 'A' || r > 'Z' }) >= 0 || item.Price < .01 || math.IsNaN(item.Price) || math.IsInf(item.Price, 0) {
					continue
				}
				seen[id] = true
				products = append(products, storeProduct{ID: id, Name: item.Name, ProductID: item.ProductId, Payments: []storePayment{{ID: "creem", Name: "Creem", Provider: "creem", Money: fmt.Sprintf("%.2f", item.Price), Currency: currency, Quota: quota}}})
			}
		}
	}
	return products
}

func GetStoreCatalog(c *gin.Context) {
	group, err := model.GetUserGroup(c.GetInt("id"), true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"products": storeProducts(group), "topup_link": common.TopUpLink, "redemption_enabled": operation_setting.IsPaymentComplianceConfirmed(), "delivery_modes": storeDeliveryModes()})
}

func CreateStoreOrder(c *gin.Context) {
	var req struct {
		ProductID      string `json:"product_id"`
		PaymentID      string `json:"payment_id"`
		Delivery       string `json:"delivery_mode"`
		QuotedMoney    string `json:"quoted_money"`
		QuotedCurrency string `json:"quoted_currency"`
		QuotedQuota    int    `json:"quoted_quota"`
	}
	if c.ShouldBindJSON(&req) != nil || (req.Delivery != model.TopUpDeliveryBalance && req.Delivery != model.TopUpDeliveryRedemption) {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	allowed := false
	for _, mode := range storeDeliveryModes() {
		if req.Delivery == mode {
			allowed = true
			break
		}
	}
	if !allowed {
		common.ApiErrorT(c, "Selected delivery method is unavailable; refresh and try again")
		return
	}
	group, err := model.GetUserGroup(c.GetInt("id"), true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var product *storeProduct
	var payment *storePayment
	for _, candidate := range storeProducts(group) {
		if candidate.ID != req.ProductID {
			continue
		}
		product = &candidate
		for _, method := range candidate.Payments {
			if method.ID == req.PaymentID {
				payment = &method
				break
			}
		}
		break
	}
	if product == nil || payment == nil {
		common.ApiErrorT(c, "Selected product or payment method is unavailable")
		return
	}
	if payment.Money != req.QuotedMoney || payment.Currency != req.QuotedCurrency || payment.Quota != req.QuotedQuota {
		common.ApiErrorT(c, "Price changed; refresh and confirm the order again")
		return
	}
	c.Set("store_delivery_mode", req.Delivery)
	c.Set("store_quota", payment.Quota)
	c.Set("store_money", payment.Money)
	c.Set("store_currency", payment.Currency)
	payload := gin.H{"amount": product.Amount, "payment_method": payment.Provider}
	if payment.Provider == "epay" {
		payload["payment_method"] = strings.TrimPrefix(payment.ID, "epay:")
	}
	if payment.Provider == "creem" {
		payload["product_id"] = product.ProductID
	}
	body, err := common.Marshal(payload)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(body))
	c.Request.ContentLength = int64(len(body))
	switch payment.Provider {
	case "epay":
		RequestEpay(c)
	case "stripe":
		RequestStripePay(c)
	case "creem":
		RequestCreemPay(c)
	case "waffo":
		RequestWaffoPay(c)
	case "waffo_pancake":
		RequestWaffoPancakePay(c)
	}
}

func GetStoreOrder(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	var order model.TopUp
	if err := model.DB.Where("trade_no = ? AND user_id = ?", c.Param("trade_no"), c.GetInt("id")).First(&order).Error; err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	data := gin.H{"order": order}
	if order.Status == common.TopUpStatusSuccess && order.DeliveryMode == model.TopUpDeliveryRedemption && order.RedemptionId > 0 {
		var code model.Redemption
		if err := model.DB.Where("id = ? AND user_id = ?", order.RedemptionId, order.UserId).First(&code).Error; err == nil {
			data["redemption"] = gin.H{"key": code.Key, "quota": code.Quota, "status": code.Status, "expired_time": code.ExpiredTime}
		} else {
			data["redemption_unavailable"] = true
		}
	}
	common.ApiSuccess(c, data)
}
