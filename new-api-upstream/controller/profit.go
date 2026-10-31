package controller

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func GetProfitOverview(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	overview, err := model.QueryProfitOverview(ctx, time.Now())
	if err != nil {
		common.SysError("profit overview query failed: " + err.Error())
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to query statistics"))
		return
	}
	common.ApiSuccess(c, overview)
}

func GetProfitReport(c *gin.Context) {
	var query struct {
		Start     int64  `form:"start_timestamp" binding:"required,gt=0"`
		End       int64  `form:"end_timestamp" binding:"required,gt=0"`
		ChannelID int    `form:"channel_id" binding:"gte=0"`
		Model     string `form:"model" binding:"max=256"`
		Group     string `form:"group" binding:"max=64"`
	}
	page, pageErr := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, sizeErr := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if c.ShouldBindQuery(&query) != nil || pageErr != nil || sizeErr != nil || page < 1 || page > model.MaxProfitReportRows || size < 1 || size > 100 || query.End <= query.Start || query.End-query.Start > 31*86400 {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	report, err := model.QueryProfitReport(c.Request.Context(), model.ProfitFilter{Start: query.Start, End: query.End, ChannelID: query.ChannelID, Model: strings.TrimSpace(query.Model), Group: strings.TrimSpace(query.Group), Page: page, PageSize: size})
	if err != nil {
		if errors.Is(err, model.ErrProfitReportTooLarge) {
			common.ApiErrorStatus(c, http.StatusUnprocessableEntity, common.NewMessage("Profit report is too large; narrow the time range or filters"))
			return
		}
		common.SysError("profit report query failed: " + err.Error())
		common.ApiErrorStatus(c, http.StatusInternalServerError, common.NewMessage("Failed to query statistics"))
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"success": true, "data": report, "timezone": time.Local.String()})
}
