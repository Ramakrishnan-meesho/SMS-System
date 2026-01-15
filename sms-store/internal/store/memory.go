package store

import (
	"sync"

	"sms-store/internal/models"
)

type MemoryStore struct {
	mu       sync.Mutex
	messages []models.Message
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		messages: make([]models.Message, 0),
	}
}

func (s *MemoryStore) Save(msg models.Message) (models.Message, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.messages = append(s.messages, msg)
	return msg, nil
}

func (s *MemoryStore) List() ([]models.Message, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	out := make([]models.Message, len(s.messages))
	copy(out, s.messages)
	return out, nil
}

func (s *MemoryStore) FindByUserID(userID string) ([]models.Message, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var result []models.Message
	for _, msg := range s.messages {
		if msg.UserID == userID {
			result = append(result, msg)
		}
	}
	return result, nil
}

func (s *MemoryStore) DeleteAll() (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	count := int64(len(s.messages))
	s.messages = make([]models.Message, 0)
	return count, nil
}
