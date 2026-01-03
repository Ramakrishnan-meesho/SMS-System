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
