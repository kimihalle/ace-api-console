package controller

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const maxImageStudioPayloadBytes = 24 << 20

type imageStudioRecordResponse struct {
	ID         string `json:"id"`
	RequestID  string `json:"request_id"`
	Model      string `json:"model"`
	Prompt     string `json:"prompt"`
	CreatedAt  int64  `json:"created_at"`
	ImageCount int    `json:"image_count"`
}

func imageStudioResponse(record model.ImageStudioRecord) imageStudioRecordResponse {
	return imageStudioRecordResponse{
		ID:         record.ID,
		RequestID:  record.RequestID,
		Model:      record.Model,
		Prompt:     record.Prompt,
		CreatedAt:  record.CreatedAt,
		ImageCount: record.ImageCount,
	}
}

func SaveImageStudioRecord(c *gin.Context) {
	if c.Request.ContentLength > maxImageStudioPayloadBytes {
		c.AbortWithStatus(http.StatusRequestEntityTooLarge)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxImageStudioPayloadBytes)
	var input model.ImageStudioRecordInput
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	input.ID = strings.TrimSpace(input.ID)
	input.RequestID = strings.TrimSpace(input.RequestID)
	input.Model = strings.TrimSpace(input.Model)
	input.Prompt = strings.TrimSpace(input.Prompt)
	if input.ID == "" || len(input.ID) > 64 || input.RequestID == "" || len(input.RequestID) > 64 || input.Model == "" || len(input.Model) > 128 || len(input.Prompt) > 4000 || len(input.Sources) == 0 || len(input.Sources) > 4 {
		common.ApiErrorT(c, "Invalid image generation record")
		return
	}
	totalBytes := 0
	for _, source := range input.Sources {
		totalBytes += len(source)
		if totalBytes > maxImageStudioPayloadBytes || !validImageStudioSource(source) {
			common.ApiErrorT(c, "Invalid image generation record")
			return
		}
	}
	userID := c.GetInt("id")
	ownsRequest, err := model.IsImageStudioRequestOwner(userID, input.RequestID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !ownsRequest {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	if err := model.SaveImageStudioRecord(userID, input, common.GetTimestamp()); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func GetUserImageStudioRecords(c *gin.Context) {
	records, err := model.GetImageStudioRecords(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	items := make([]imageStudioRecordResponse, 0, len(records))
	for _, record := range records {
		items = append(items, imageStudioResponse(record))
	}
	common.ApiSuccess(c, items)
}

func getImageStudioSource(c *gin.Context, record *model.ImageStudioRecord) {
	if record == nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	index, err := strconv.Atoi(c.Param("index"))
	if err != nil || index < 0 {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	var sources []string
	if err := json.Unmarshal([]byte(record.Sources), &sources); err != nil || index >= len(sources) {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	source := sources[index]
	if strings.HasPrefix(strings.ToLower(source), "data:") {
		metadata, encoded, ok := strings.Cut(source, ",")
		if !ok || !strings.HasSuffix(strings.ToLower(metadata), ";base64") {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		imageData, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		contentType := strings.TrimPrefix(strings.TrimSuffix(strings.ToLower(metadata), ";base64"), "data:")
		c.Header("Content-Type", contentType)
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Content-Security-Policy", "default-src 'none'")
		c.Header("Cache-Control", "private, no-store")
		c.Data(http.StatusOK, contentType, imageData)
		return
	}
	parsed, err := url.Parse(source)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	c.Header("Referrer-Policy", "no-referrer")
	c.Header("Cache-Control", "private, no-store")
	common.ApiSuccess(c, gin.H{"source": parsed.String()})
}

func GetUserImageStudioSource(c *gin.Context) {
	record, err := model.GetImageStudioRecordForUser(c.GetInt("id"), c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	getImageStudioSource(c, record)
}

func GetAdminImageStudioSource(c *gin.Context) {
	record, err := model.GetImageStudioRecordByRequestID(c.Param("request_id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	getImageStudioSource(c, record)
}

func validImageStudioSource(source string) bool {
	if strings.HasPrefix(strings.ToLower(source), "data:") {
		metadata, encoded, ok := strings.Cut(source, ",")
		metadata = strings.ToLower(metadata)
		if !ok || !(metadata == "data:image/png;base64" || metadata == "data:image/jpeg;base64" || metadata == "data:image/webp;base64") {
			return false
		}
		decoded, err := base64.StdEncoding.DecodeString(encoded)
		return err == nil && len(decoded) > 0
	}
	parsed, err := url.Parse(source)
	return err == nil && parsed.Scheme == "https" && parsed.Host != "" && parsed.User == nil
}
