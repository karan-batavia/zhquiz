package db

import (
	"gorm.io/gorm"
)

// Deck is user database model for Deck
type Deck struct {
	gorm.Model

	UserID uint `gorm:"index:deck_unique_idx,unique"`

	Name string `gorm:"index:deck_unique_idx,unique"`
	Q    string
}
