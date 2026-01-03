package models

import "time"

type Message struct {
	ID          string    `json:"id"`
	UserID      string    `json:"userId"`
	PhoneNumber string    `json:"phoneNumber"`
	Text        string    `json:"text"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"createdAt"`
}
