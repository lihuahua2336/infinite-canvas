package repository

import (
	"errors"
	"strings"

	"github.com/tigerowo/infinite-canvas/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ListUsers 分页查询用户。
func ListUsers(q model.Query) ([]model.User, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.User{})
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("username LIKE ? OR display_name LIKE ? OR email LIKE ? OR linux_do_id LIKE ? OR logto_id LIKE ?", like, like, like, like, like)
	}

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var users []model.User
	err = tx.Order("created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&users).Error
	return users, total, err
}

// CountUsers 返回用户总数。
func CountUsers() (int64, error) {
	db, err := DB()
	if err != nil {
		return 0, err
	}
	var total int64
	return total, db.Model(&model.User{}).Count(&total).Error
}

// HasAdmin 判断系统中是否存在管理员。
func HasAdmin() (bool, error) {
	db, err := DB()
	if err != nil {
		return false, err
	}
	var total int64
	err = db.Model(&model.User{}).Where("role = ?", model.UserRoleAdmin).Count(&total).Error
	return total > 0, err
}

// GetUserByID 根据 ID 查询用户。
func GetUserByID(id string) (model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, false, err
	}
	return findUser(db, "id = ?", id)
}

// GetUserByUsername 根据用户名查询用户。
func GetUserByUsername(username string) (model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, false, err
	}
	return findUser(db, "username = ?", username)
}

// SaveUser 保存用户信息。
func SaveUser(user model.User) (model.User, error) {
	db, err := DB()
	if err != nil {
		return user, err
	}
	return user, db.Save(&user).Error
}

func ConsumeUserCredits(id string, credits float64, now string) (model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, false, err
	}
	if credits <= 0 {
		user, ok, err := GetUserByID(id)
		return user, ok, err
	}
	tx := db.Model(&model.User{}).Where("id = ? AND credits >= CAST(? AS DECIMAL(20,2))", id, credits).Updates(map[string]any{
		"credits":    gorm.Expr("ROUND(credits - CAST(? AS DECIMAL(20,2)), 2)", credits),
		"updated_at": now,
	})
	if tx.Error != nil {
		return model.User{}, false, tx.Error
	}
	user, ok, err := GetUserByID(id)
	return user, ok && tx.RowsAffected > 0, err
}

func RefundUserCredits(id string, credits float64, now string) (model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, false, err
	}
	if credits <= 0 {
		user, ok, err := GetUserByID(id)
		return user, ok, err
	}
	tx := db.Model(&model.User{}).Where("id = ?", id).Updates(map[string]any{
		"credits":    gorm.Expr("ROUND(credits + CAST(? AS DECIMAL(20,2)), 2)", credits),
		"updated_at": now,
	})
	if tx.Error != nil {
		return model.User{}, false, tx.Error
	}
	user, ok, err := GetUserByID(id)
	return user, ok && tx.RowsAffected > 0, err
}

// SaveCreditLog 保存算力点变更流水。
func SaveCreditLog(log model.CreditLog) (model.CreditLog, error) {
	db, err := DB()
	if err != nil {
		return log, err
	}
	return log, db.Save(&log).Error
}

func ListCreditLogs(q model.Query) ([]model.CreditLog, int64, error) {
	db, err := DB()
	if err != nil {
		return nil, 0, err
	}
	q.Normalize()
	tx := db.Model(&model.CreditLog{}).Joins("LEFT JOIN users ON users.id = credit_logs.user_id")
	if keyword := strings.TrimSpace(q.Keyword); keyword != "" {
		like := "%" + keyword + "%"
		tx = tx.Where("user_id LIKE ? OR type LIKE ? OR remark LIKE ? OR related_id LIKE ? OR users.username LIKE ? OR users.display_name LIKE ?", like, like, like, like, like, like)
	}
	if q.Date != "" {
		tx = tx.Where("SUBSTR(credit_logs.created_at, 1, 10) = ?", q.Date)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var logs []model.CreditLog
	err = tx.Select("credit_logs.*, COALESCE(NULLIF(users.display_name, ''), users.username) AS user_display_name").Order("credit_logs.created_at desc").Offset(q.Offset()).Limit(q.PageSize).Find(&logs).Error
	return logs, total, err
}

func DeleteCreditLog(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.CreditLog{}, "id = ?", id).Error
}

// DeleteUser 删除指定用户。
func DeleteUser(id string) error {
	db, err := DB()
	if err != nil {
		return err
	}
	return db.Delete(&model.User{}, "id = ?", id).Error
}

// GetUserByLinuxDoID 根据 Linux.do ID 查询用户。
func GetUserByLinuxDoID(id string) (model.User, bool, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, false, err
	}
	return findUser(db, "linux_do_id = ?", id)
}

// ProvisionLogtoUser 创建或更新 Logto 对应的本地账户。首个 Logto 账户会原子地认领管理员角色。
func ProvisionLogtoUser(candidate model.User) (model.User, error) {
	db, err := DB()
	if err != nil {
		return model.User{}, err
	}
	var result model.User
	err = db.Transaction(func(tx *gorm.DB) error {
		user, ok, err := findUser(tx, "logto_id = ?", *candidate.LogtoID)
		if err != nil {
			return err
		}
		if ok {
			user.Email = firstNonEmpty(candidate.Email, user.Email)
			user.DisplayName = firstNonEmpty(candidate.DisplayName, user.DisplayName)
			user.AvatarURL = firstNonEmpty(candidate.AvatarURL, user.AvatarURL)
			user.LastLoginAt = candidate.LastLoginAt
			user.UpdatedAt = candidate.UpdatedAt
			if err := tx.Save(&user).Error; err != nil {
				return err
			}
			result = user
			return nil
		}

		bootstrap := model.AuthBootstrap{ID: "logto-primary-admin", UserID: candidate.ID, CreatedAt: candidate.CreatedAt}
		claim := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&bootstrap)
		if claim.Error != nil {
			return claim.Error
		}
		candidate.Role = model.UserRoleUser
		if claim.RowsAffected == 1 {
			candidate.Role = model.UserRoleAdmin
		}
		if err := tx.Create(&candidate).Error; err != nil {
			return err
		}
		result = candidate
		return nil
	})
	return result, err
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

// findUser 查询单个用户，并将未命中转换为 ok=false。
func findUser(db *gorm.DB, query string, args ...any) (model.User, bool, error) {
	user := model.User{}
	err := db.Where(query, args...).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return model.User{}, false, nil
	}
	return user, err == nil, err
}
