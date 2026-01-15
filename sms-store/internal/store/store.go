package store

import "sms-store/internal/models"

// Store defines the interface for message storage operations.
// This allows us to switch between different storage implementations
// (e.g., MemoryStore, MongoStore) without changing the handler code.
type Store interface {
	// Save stores a message and returns the saved message.
	// The message should include an ID (can be generated or provided).
	Save(msg models.Message) (models.Message, error)

	// SaveBatch stores multiple messages in a single operation for better performance.
	// Returns the number of successfully saved messages and any error.
	SaveBatch(msgs []models.Message) (int, error)

	// FindByPhoneNumber retrieves all messages for a specific phone number.
	// Returns an empty slice if no messages are found (not an error).
	FindByPhoneNumber(phoneNumber string) ([]models.Message, error)

	// List retrieves all messages (used for testing/debugging).
	// Returns an empty slice if no messages are found.
	List() ([]models.Message, error)

	// DeleteAll removes all messages from the store.
	// Returns the number of deleted messages and any error.
	DeleteAll() (int64, error)
}
