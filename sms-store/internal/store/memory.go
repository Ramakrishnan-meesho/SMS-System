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

func (s *MemoryStore) FindByPhoneNumber(phoneNumber string) ([]models.Message, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var result []models.Message
	for _, msg := range s.messages {
		if msg.PhoneNumber == phoneNumber {
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

func (s *MemoryStore) SaveBatch(msgs []models.Message) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.messages = append(s.messages, msgs...)
	return len(msgs), nil
}

func (s *MemoryStore) GetDistinctPhoneNumbers() ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	phoneNumberSet := make(map[string]bool)
	for _, msg := range s.messages {
		if msg.PhoneNumber != "" {
			phoneNumberSet[msg.PhoneNumber] = true
		}
	}

	result := make([]string, 0, len(phoneNumberSet))
	for pn := range phoneNumberSet {
		result = append(result, pn)
	}

	return result, nil
}

func (s *MemoryStore) DeleteByPhoneNumber(phoneNumber string) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var deletedCount int64
	filtered := make([]models.Message, 0, len(s.messages))
	
	for _, msg := range s.messages {
		if msg.PhoneNumber != phoneNumber {
			filtered = append(filtered, msg)
		} else {
			deletedCount++
		}
	}
	
	s.messages = filtered
	return deletedCount, nil
}
