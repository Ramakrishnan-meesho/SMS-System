package store

import "sms-store/internal/models"

// Store defines the interface for message storage operations.
// This allows us to switch between different storage implementations
// (e.g., MemoryStore, MongoStore) without changing the handler code.
type Store interface {
	// Save stores a message and returns the saved message.
	// The message should include an ID (can be generated or provided).
	Save(msg models.Message) (models.Message, error)

	// FindByUserID retrieves all messages for a specific user.
	// Returns an empty slice if no messages are found (not an error).
	FindByUserID(userID string) ([]models.Message, error)

	// List retrieves all messages (used for testing/debugging).
	// Returns an empty slice if no messages are found.
	List() ([]models.Message, error)

	// DeleteAll removes all messages from the store.
	// Returns the number of deleted messages and any error.
	DeleteAll() (int64, error)
}
