package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func storeTestDatabase(t *testing.T) *gorm.DB {
	t.Helper()
	var dialect gorm.Dialector = sqlite.Open(filepath.Join(t.TempDir(), "store.db"))
	switch os.Getenv("STORE_TEST_DIALECT") {
	case "mysql":
		dialect = mysql.Open(os.Getenv("STORE_TEST_DSN"))
	case "postgres":
		dialect = postgres.Open(os.Getenv("STORE_TEST_DSN"))
	}
	db, err := gorm.Open(dialect, &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	oldDB, oldLog := model.DB, model.LOG_DB
	oldRedis := common.RedisEnabled
	common.RedisEnabled = false
	oldMain, oldLogType := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB, model.LOG_DB = db, db
	common.SetMainDatabaseType(common.DatabaseType(dialect.Name()))
	common.SetLogDatabaseType(common.DatabaseType(dialect.Name()))
	t.Setenv("LOG_SQL_DSN", "")
	master := common.IsMasterNode
	common.IsMasterNode = false
	err = model.InitLogDB()
	common.IsMasterNode = master
	require.NoError(t, err)
	t.Cleanup(func() {
		common.RedisEnabled = oldRedis
		model.DB, model.LOG_DB = oldDB, oldLog
		common.SetMainDatabaseType(oldMain)
		common.SetLogDatabaseType(oldLogType)
		_ = sqlDB.Close()
	})
	query := "SELECT version()"
	if dialect.Name() == "sqlite" {
		query = "SELECT sqlite_version()"
	}
	var version string
	require.NoError(t, db.Raw(query).Scan(&version).Error)
	t.Logf("database=%s version=%s", dialect.Name(), version)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Redemption{}, &model.Log{}))
	return db
}

// This is the released order schema, before delivery metadata was introduced.
type legacyStoreOrder struct {
	Id              int `gorm:"primaryKey"`
	UserId          int `gorm:"index"`
	Amount          int64
	Money           float64
	TradeNo         string `gorm:"unique;type:varchar(255);index"`
	PaymentMethod   string `gorm:"type:varchar(50)"`
	PaymentProvider string `gorm:"type:varchar(50);default:''"`
	CreateTime      int64
	CompleteTime    int64
	Status          string
}

func (legacyStoreOrder) TableName() string { return "top_ups" }

func TestStoreDeliveryPersistence(t *testing.T) {
	db := storeTestDatabase(t)
	for _, upgrade := range []bool{false, true} {
		t.Run(fmt.Sprintf("upgrade=%t", upgrade), func(t *testing.T) {
			require.NoError(t, db.Migrator().DropTable(&model.TopUp{}))
			if upgrade {
				require.NoError(t, db.AutoMigrate(&legacyStoreOrder{}))
				require.NoError(t, db.Create(&legacyStoreOrder{TradeNo: "legacy", Amount: 7, Money: 12.34, Status: common.TopUpStatusPending}).Error)
			}
			for range 2 {
				require.NoError(t, db.AutoMigrate(&model.TopUp{}))
			}
			if upgrade {
				var legacy model.TopUp
				require.NoError(t, db.Where("trade_no = ?", "legacy").First(&legacy).Error)
				assert.Equal(t, int64(7), legacy.Amount)
				assert.Equal(t, 12.34, legacy.Money)
				assert.Empty(t, legacy.DeliveryMode)
				assert.Zero(t, legacy.RedemptionId)
				assert.Error(t, db.Create(&model.TopUp{TradeNo: "legacy"}).Error, "order uniqueness survives migration")
			}
			for _, provider := range []string{model.PaymentProviderEpay, model.PaymentProviderStripe, model.PaymentProviderCreem, model.PaymentProviderWaffo, model.PaymentProviderWaffoPancake, "manual"} {
				for _, mode := range []string{model.TopUpDeliveryBalance, model.TopUpDeliveryRedemption} {
					t.Run(provider+"/"+mode, func(t *testing.T) {
						user := &model.User{Username: common.GetUUID(), AffCode: common.GetRandomString(8), Status: common.UserStatusEnabled, Quota: 50}
						require.NoError(t, db.Create(user).Error)
						order := &model.TopUp{UserId: user.Id, Amount: 2, Money: 3, TradeNo: common.GetUUID(), PaymentMethod: provider, PaymentProvider: provider, Status: common.TopUpStatusPending, DeliveryMode: mode, CreditedQuota: 1200}
						require.NoError(t, order.Insert())
						settle := func() error {
							switch provider {
							case model.PaymentProviderEpay:
								_, err := model.RechargeEpay(order.TradeNo, "alipay", "")
								return err
							case model.PaymentProviderStripe:
								return model.Recharge(order.TradeNo, "customer", "")
							case model.PaymentProviderCreem:
								return model.RechargeCreem(order.TradeNo, "", "", "")
							case model.PaymentProviderWaffo:
								return model.RechargeWaffo(order.TradeNo, "")
							case model.PaymentProviderWaffoPancake:
								return model.RechargeWaffoPancake(order.TradeNo)
							default:
								return model.ManualCompleteTopUp(order.TradeNo, "")
							}
						}
						require.NoError(t, settle())
						require.NoError(t, settle(), "duplicate callback is idempotent")
						require.NoError(t, db.First(user, user.Id).Error)
						require.NoError(t, db.First(order, order.Id).Error)
						assert.Equal(t, common.TopUpStatusSuccess, order.Status)
						var count int64
						require.NoError(t, db.Model(&model.Redemption{}).Where("user_id = ?", user.Id).Count(&count).Error)
						if mode == model.TopUpDeliveryBalance {
							assert.Equal(t, 1250, user.Quota)
							assert.Zero(t, count)
							return
						}
						assert.Equal(t, 50, user.Quota, "issuing a code does not also credit the wallet")
						assert.Equal(t, int64(1), count)
						var code model.Redemption
						require.NoError(t, db.First(&code, order.RedemptionId).Error)
						assert.Equal(t, 1200, code.Quota)
						assert.Len(t, code.Key, 32)
						// A paid code can be gifted; redeem credits only its recipient, once.
						recipient := &model.User{Username: common.GetUUID(), AffCode: common.GetRandomString(8), Status: common.UserStatusEnabled}
						require.NoError(t, db.Create(recipient).Error)
						quota, err := model.Redeem(code.Key, recipient.Id)
						require.NoError(t, err)
						assert.Equal(t, 1200, quota)
						_, err = model.Redeem(code.Key, recipient.Id)
						assert.Error(t, err)
						require.NoError(t, db.First(recipient, recipient.Id).Error)
						assert.Equal(t, 1200, recipient.Quota)
					})
				}
			}
		})
	}
}

func TestStoreConcurrentAndFailedDelivery(t *testing.T) {
	db := storeTestDatabase(t)
	require.NoError(t, db.AutoMigrate(&model.TopUp{}))
	user := &model.User{Username: common.GetUUID(), AffCode: common.GetRandomString(8), Quota: 10}
	require.NoError(t, db.Create(user).Error)
	order := &model.TopUp{UserId: user.Id, TradeNo: common.GetUUID(), Amount: 1, PaymentProvider: model.PaymentProviderEpay, Status: common.TopUpStatusPending, DeliveryMode: model.TopUpDeliveryRedemption, CreditedQuota: 321}
	require.NoError(t, order.Insert())
	start := make(chan struct{})
	var group sync.WaitGroup
	for range 4 {
		group.Go(func() { <-start; _, _ = model.RechargeEpay(order.TradeNo, "alipay", "") })
	}
	close(start)
	group.Wait()
	_, err := model.RechargeEpay(order.TradeNo, "alipay", "")
	require.NoError(t, err)
	var count int64
	require.NoError(t, db.Model(&model.Redemption{}).Where("user_id = ?", user.Id).Count(&count).Error)
	assert.Equal(t, int64(1), count)
	require.NoError(t, db.First(user, user.Id).Error)
	assert.Equal(t, 10, user.Quota)
	// A real database write failure must roll back payment status as well.
	require.NoError(t, db.Migrator().DropTable(&model.Redemption{}))
	broken := &model.TopUp{UserId: user.Id, TradeNo: common.GetUUID(), Amount: 1, PaymentProvider: model.PaymentProviderEpay, Status: common.TopUpStatusPending, DeliveryMode: model.TopUpDeliveryRedemption, CreditedQuota: 321}
	require.NoError(t, broken.Insert())
	_, err = model.RechargeEpay(broken.TradeNo, "alipay", "")
	require.Error(t, err)
	require.NoError(t, db.First(broken, broken.Id).Error)
	assert.Equal(t, common.TopUpStatusPending, broken.Status)
	assert.Zero(t, broken.RedemptionId)
	require.NoError(t, db.AutoMigrate(&model.Redemption{}))
	_, err = model.RechargeEpay(broken.TradeNo, "alipay", "")
	require.NoError(t, err)
}

func TestStoreCatalogOrdersAndOwnerAccess(t *testing.T) {
	db := storeTestDatabase(t)
	require.NoError(t, db.AutoMigrate(&model.TopUp{}))
	user := &model.User{Username: common.GetUUID(), AffCode: common.GetRandomString(8), Group: "default", Quota: 10}
	require.NoError(t, db.Create(user).Error)
	oldPayment := *operation_setting.GetPaymentSetting()
	oldAddress, oldID, oldKey := operation_setting.PayAddress, operation_setting.EpayId, operation_setting.EpayKey
	oldPrice, oldMethods := operation_setting.Price, operation_setting.PayMethods
	t.Cleanup(func() {
		*operation_setting.GetPaymentSetting() = oldPayment
		operation_setting.PayAddress, operation_setting.EpayId, operation_setting.EpayKey = oldAddress, oldID, oldKey
		operation_setting.Price, operation_setting.PayMethods = oldPrice, oldMethods
	})
	operation_setting.GetPaymentSetting().ComplianceConfirmed = true
	operation_setting.GetPaymentSetting().ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
	operation_setting.GetPaymentSetting().AmountOptions = []int{10}
	operation_setting.GetPaymentSetting().AmountDiscount = map[int]float64{10: .8}
	operation_setting.PayAddress, operation_setting.EpayId, operation_setting.EpayKey = "https://payments.example.test", "1", "fixture-only"
	operation_setting.Price, operation_setting.PayMethods = 1, []map[string]string{{"type": "alipay", "name": "Alipay"}}
	products := storeProducts("default")
	require.Len(t, products, 1)
	require.Len(t, products[0].Payments, 1)
	quote := products[0].Payments[0]
	assert.Equal(t, "8.00", quote.Money)
	router := gin.New()
	router.Use(func(c *gin.Context) { id, _ := strconv.Atoi(c.GetHeader("X-Test-User")); c.Set("id", id) })
	router.POST("/orders", CreateStoreOrder)
	router.GET("/catalog", GetStoreCatalog)
	router.PUT("/option", UpdateOption)
	router.GET("/orders/:trade_no", GetStoreOrder)
	request := func(method, path, body string, userID int) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-User", fmt.Sprint(userID))
		router.ServeHTTP(recorder, req)
		return recorder
	}
	body := fmt.Sprintf(`{"product_id":"amount:10","payment_id":"epay:alipay","delivery_mode":"redemption","quoted_money":"8.00","quoted_currency":"CNY","quoted_quota":%d}`, quote.Quota)
	for _, mode := range []string{model.TopUpDeliveryBalance, model.TopUpDeliveryRedemption} {
		operation_setting.GetPaymentSetting().StoreDeliveryMode = mode
		catalog := request("GET", "/catalog", "", user.Id)
		var catalogResult struct {
			Data struct {
				DeliveryModes []string `json:"delivery_modes"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(catalog.Body.Bytes(), &catalogResult))
		assert.Equal(t, []string{mode}, catalogResult.Data.DeliveryModes)
		blockedBody := body
		if mode == model.TopUpDeliveryRedemption {
			blockedBody = strings.Replace(body, "redemption", "balance", 1)
		}
		assert.Contains(t, request("POST", "/orders", blockedBody, user.Id).Body.String(), "Selected delivery method is unavailable")
	}
	var orderCount int64
	require.NoError(t, db.Model(&model.TopUp{}).Where("user_id = ?", user.Id).Count(&orderCount).Error)
	assert.Zero(t, orderCount, "disabled delivery cannot create an order")
	invalidOption := request("PUT", "/option", `{"key":"payment_setting.store_delivery_mode","value":"unsupported"}`, user.Id)
	assert.Contains(t, invalidOption.Body.String(), "Invalid parameters")
	operation_setting.GetPaymentSetting().StoreDeliveryMode = "both"
	stale := request("POST", "/orders", strings.Replace(body, "8.00", "1.00", 1), user.Id)
	assert.Contains(t, stale.Body.String(), "Price changed")
	response := request("POST", "/orders", body, user.Id)
	assert.Contains(t, response.Body.String(), `"message":"success"`)
	var result struct {
		OrderID string `json:"order_id"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	require.NotEmpty(t, result.OrderID)
	owner := request("GET", "/orders/"+result.OrderID, "", user.Id)
	assert.NotContains(t, owner.Body.String(), `"redemption":`)
	operation_setting.GetPaymentSetting().StoreDeliveryMode = "balance" // Existing orders retain their delivery snapshot.
	_, err := model.RechargeEpay(result.OrderID, "alipay", "")
	require.NoError(t, err)
	owner = request("GET", "/orders/"+result.OrderID, "", user.Id)
	assert.Contains(t, owner.Body.String(), `"redemption":`)
	assert.Equal(t, "no-store", owner.Header().Get("Cache-Control"))
	for _, id := range []int{0, user.Id + 999} {
		assert.Equal(t, http.StatusNotFound, request("GET", "/orders/"+result.OrderID, "", id).Code)
	}
	listed, _, err := model.GetUserTopUps(user.Id, &common.PageInfo{Page: 1, PageSize: 10})
	require.NoError(t, err)
	encoded, err := common.Marshal(listed)
	require.NoError(t, err)
	assert.NotContains(t, string(encoded), `"key":`, "plain codes never appear in list APIs")
}
