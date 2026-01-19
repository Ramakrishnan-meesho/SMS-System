package models

import "time"

// Profile represents a user profile in the system.
// PhoneNumber is used as the primary key.
type Profile struct {
	PhoneNumber string    `json:"phoneNumber" bson:"phoneNumber"`
	Name        string    `json:"name" bson:"name"`
	Avatar      string    `json:"avatar" bson:"avatar"` // URL or base64 encoded image
	CreatedAt   time.Time `json:"createdAt" bson:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt" bson:"updatedAt"`
}
