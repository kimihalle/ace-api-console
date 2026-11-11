package model

import (
	"encoding/json"
	"errors"

	"gorm.io/gorm"
)

const ImageStudioHistoryLimit = 30
const ImageStudioHistoryBytesLimit = 128 << 20

type ImageStudioRecord struct {
	ID         string `json:"id" gorm:"primaryKey;size:64"`
	UserID     int    `json:"-" gorm:"primaryKey;index:idx_image_studio_user_created,priority:1"`
	RequestID  string `json:"request_id" gorm:"uniqueIndex;size:64;not null"`
	Model      string `json:"model" gorm:"size:128;not null"`
	Prompt     string `json:"prompt" gorm:"type:text;not null"`
	ImageCount int    `json:"image_count" gorm:"not null"`
	CreatedAt  int64  `json:"created_at" gorm:"index:idx_image_studio_user_created,priority:2"`
	Sources    string `json:"-" gorm:"type:text;not null"`
}

type ImageStudioRecordInput struct {
	ID        string   `json:"id"`
	RequestID string   `json:"request_id"`
	Model     string   `json:"model"`
	Prompt    string   `json:"prompt"`
	Sources   []string `json:"sources"`
}

func SaveImageStudioRecord(userID int, input ImageStudioRecordInput, createdAt int64) error {
	sources, err := json.Marshal(input.Sources)
	if err != nil {
		return err
	}
	record := ImageStudioRecord{
		ID:         input.ID,
		UserID:     userID,
		RequestID:  input.RequestID,
		Model:      input.Model,
		Prompt:     input.Prompt,
		ImageCount: len(input.Sources),
		CreatedAt:  createdAt,
		Sources:    string(sources),
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		var records []ImageStudioRecord
		if err := tx.Select("id", "sources").
			Where("user_id = ?", userID).
			Order("created_at desc, id desc").
			Find(&records).Error; err != nil {
			return err
		}
		var expired []string
		storedBytes := 0
		for i, oldRecord := range records {
			if i >= ImageStudioHistoryLimit || storedBytes+len(oldRecord.Sources) > ImageStudioHistoryBytesLimit {
				expired = append(expired, oldRecord.ID)
				continue
			}
			storedBytes += len(oldRecord.Sources)
		}
		if len(expired) == 0 {
			return nil
		}
		return tx.Where("user_id = ? AND id IN ?", userID, expired).Delete(&ImageStudioRecord{}).Error
	})
}

func IsImageStudioRequestOwner(userID int, requestID string) (bool, error) {
	var log Log
	err := LOG_DB.Select("user_id", "type", "other").
		Where("user_id = ? AND request_id = ? AND type = ?", userID, requestID, LogTypeConsume).
		First(&log).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	var metadata struct {
		AdminInfo struct {
			ImageStudio bool `json:"image_studio"`
		} `json:"admin_info"`
	}
	if err := json.Unmarshal([]byte(log.Other), &metadata); err != nil {
		return false, err
	}
	return metadata.AdminInfo.ImageStudio, nil
}

func GetImageStudioRecords(userID int) ([]ImageStudioRecord, error) {
	var records []ImageStudioRecord
	err := DB.Model(&ImageStudioRecord{}).
		Where("user_id = ?", userID).
		Order("created_at desc, id desc").
		Limit(ImageStudioHistoryLimit).
		Omit("sources").
		Find(&records).Error
	return records, err
}

func GetImageStudioRecordForUser(userID int, id string) (*ImageStudioRecord, error) {
	var record ImageStudioRecord
	err := DB.Where("user_id = ? AND id = ?", userID, id).First(&record).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &record, err
}

func GetImageStudioRecordByRequestID(requestID string) (*ImageStudioRecord, error) {
	var record ImageStudioRecord
	err := DB.Where("request_id = ?", requestID).First(&record).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &record, err
}
