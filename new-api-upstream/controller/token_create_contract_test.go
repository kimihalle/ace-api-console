package controller

import (
	"net/http"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAddTokenReturnsOwnedIdentityAndFullKey(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	ctx, response := newAuthenticatedContext(t, http.MethodPost, "/api/token/", map[string]any{
		"name": "created-contract", "user_id": 999, "expired_time": -1, "unlimited_quota": true,
	}, 1)
	AddToken(ctx)
	result := decodeAPIResponse(t, response)
	require.True(t, result.Success, result.Message)
	var created struct {
		ID  int    `json:"id"`
		Key string `json:"key"`
	}
	require.NoError(t, common.Unmarshal(result.Data, &created))
	require.Positive(t, created.ID)
	var stored model.Token
	require.NoError(t, db.First(&stored, created.ID).Error)
	assert.Equal(t, 1, stored.UserId, "the authenticated user owns the token, not the request's user_id")
	assert.Equal(t, stored.GetFullKey(), created.Key)
	assert.Equal(t, "no-store", response.Header().Get("Cache-Control"))

	for _, userID := range []int{1, 2} {
		ctx, response := newAuthenticatedContext(t, http.MethodPost, "/api/token/"+strconv.Itoa(created.ID)+"/key", nil, userID)
		ctx.Params = gin.Params{{Key: "id", Value: strconv.Itoa(created.ID)}}
		GetTokenKey(ctx)
		result := decodeAPIResponse(t, response)
		assert.Equal(t, userID == 1, result.Success)
		if userID == 1 {
			var reread tokenKeyResponse
			require.NoError(t, common.Unmarshal(result.Data, &reread))
			assert.Equal(t, created.Key, reread.Key, "the owner can retrieve the same key again after closing the creation dialog")
		} else {
			assert.NotContains(t, response.Body.String(), created.Key)
			assert.NotContains(t, response.Body.String(), stored.Key)
		}
	}
}
