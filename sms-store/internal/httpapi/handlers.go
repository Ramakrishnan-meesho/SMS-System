package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"sms-store/internal/models"
	"sms-store/internal/store"
)

type Handler struct {
	store        store.Store
	profileStore store.ProfileStore
}

func NewHandler(s store.Store, ps store.ProfileStore) *Handler {
	return &Handler{
		store:        s,
		profileStore: ps,
	}
}

/* ---------- helpers ---------- */

type errorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, code string, message string) {
	writeJSON(w, status, errorResponse{Code: code, Message: message})
}

/* ---------- handlers ---------- */

func (h *Handler) Ping(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "UP"})
}

type createMessageRequest struct {
	PhoneNumber string `json:"phoneNumber"`
	Text        string `json:"text"`
}

func (h *Handler) CreateMessage(w http.ResponseWriter, r *http.Request) {
	var req createMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid JSON body")
		return
	}

	req.PhoneNumber = strings.TrimSpace(req.PhoneNumber)
	req.Text = strings.TrimSpace(req.Text)

	if req.PhoneNumber == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "phoneNumber is required")
		return
	}
	if req.Text == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "text is required")
		return
	}

	msg := models.Message{
		ID:          "msg-" + time.Now().Format("20060102150405.000000000"),
		PhoneNumber: req.PhoneNumber,
		Text:        req.Text,
		Status:      "RECEIVED",
		CreatedAt:   time.Now(),
	}

	saved, err := h.store.Save(msg)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "could not save message")
		return
	}

	writeJSON(w, http.StatusCreated, saved)
}

func (h *Handler) ListMessages(w http.ResponseWriter, r *http.Request) {
	list, err := h.store.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "could not list messages")
		return
	}

	writeJSON(w, http.StatusOK, list)
}

func (h *Handler) GetUserMessages(w http.ResponseWriter, r *http.Request) {
	// Extract phoneNumber from URL path: /v1/user/{phoneNumber}/messages
	// Path will be like: /v1/user/1234567890/messages
	path := r.URL.Path

	// Validate path format: /v1/user/{phoneNumber}/messages
	prefix := "/v1/user/"
	suffix := "/messages"

	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid URL path")
		return
	}

	// Extract phoneNumber: remove prefix and suffix
	phoneNumber := strings.TrimPrefix(path, prefix)
	phoneNumber = strings.TrimSuffix(phoneNumber, suffix)
	phoneNumber = strings.TrimSpace(phoneNumber)

	// Validate phoneNumber is not empty and doesn't contain slashes (to prevent path traversal)
	if phoneNumber == "" || strings.Contains(phoneNumber, "/") {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid phoneNumber")
		return
	}

	messages, err := h.store.FindByPhoneNumber(phoneNumber)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "could not retrieve messages")
		return
	}

	// Return empty array if no messages found (not an error)
	writeJSON(w, http.StatusOK, messages)
}

func (h *Handler) DeleteAllMessages(w http.ResponseWriter, r *http.Request) {
	deletedCount, err := h.store.DeleteAll()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "could not delete messages")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":      "All messages deleted successfully",
		"deletedCount": deletedCount,
	})
}

// GetConversations retrieves all distinct phone numbers (conversations) from the store.
func (h *Handler) GetConversations(w http.ResponseWriter, r *http.Request) {
	phoneNumbers, err := h.store.GetDistinctPhoneNumbers()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "could not retrieve conversations")
		return
	}

	// Return empty array if no conversations found (not an error)
	writeJSON(w, http.StatusOK, phoneNumbers)
}

// DeleteUserMessages deletes all messages for a specific phone number.
// DELETE /v1/user/{phoneNumber}/messages
func (h *Handler) DeleteUserMessages(w http.ResponseWriter, r *http.Request) {
	// Extract phoneNumber from URL path: /v1/user/{phoneNumber}/messages
	path := r.URL.Path

	// Validate path format: /v1/user/{phoneNumber}/messages
	prefix := "/v1/user/"
	suffix := "/messages"

	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid URL path")
		return
	}

	// Extract phoneNumber: remove prefix and suffix
	phoneNumber := strings.TrimPrefix(path, prefix)
	phoneNumber = strings.TrimSuffix(phoneNumber, suffix)
	phoneNumber = strings.TrimSpace(phoneNumber)

	// Validate phoneNumber is not empty and doesn't contain slashes (to prevent path traversal)
	if phoneNumber == "" || strings.Contains(phoneNumber, "/") {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid phoneNumber")
		return
	}

	deletedCount, err := h.store.DeleteByPhoneNumber(phoneNumber)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL", "could not delete messages")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":      "Messages deleted successfully",
		"deletedCount": deletedCount,
		"phoneNumber":  phoneNumber,
	})
}

// GetProfile retrieves a profile by phone number.
// GET /v1/profile/{phoneNumber}
func (h *Handler) GetProfile(w http.ResponseWriter, r *http.Request) {
	// Extract phoneNumber from URL path: /v1/profile/{phoneNumber}
	path := r.URL.Path
	prefix := "/v1/profile/"

	if !strings.HasPrefix(path, prefix) {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid URL path")
		return
	}

	phoneNumber := strings.TrimPrefix(path, prefix)
	phoneNumber = strings.TrimSpace(phoneNumber)

	// Validate phoneNumber is not empty and doesn't contain slashes (to prevent path traversal)
	if phoneNumber == "" || strings.Contains(phoneNumber, "/") {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid phoneNumber")
		return
	}

	profile, err := h.profileStore.GetProfile(phoneNumber)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			writeError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "could not retrieve profile")
		return
	}

	writeJSON(w, http.StatusOK, profile)
}

// UpdateProfile updates an existing profile.
// PUT /v1/profile/{phoneNumber}
func (h *Handler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	// Extract phoneNumber from URL path: /v1/profile/{phoneNumber}
	path := r.URL.Path
	prefix := "/v1/profile/"

	if !strings.HasPrefix(path, prefix) {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid URL path")
		return
	}

	phoneNumber := strings.TrimPrefix(path, prefix)
	phoneNumber = strings.TrimSpace(phoneNumber)

	// Validate phoneNumber is not empty and doesn't contain slashes (to prevent path traversal)
	if phoneNumber == "" || strings.Contains(phoneNumber, "/") {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid phoneNumber")
		return
	}

	var req models.Profile
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid JSON body")
		return
	}

	// Trim and validate fields
	req.Name = strings.TrimSpace(req.Name)
	req.Avatar = strings.TrimSpace(req.Avatar)

	// Update the profile
	updated, err := h.profileStore.UpdateProfile(phoneNumber, req)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			writeError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "could not update profile")
		return
	}

	writeJSON(w, http.StatusOK, updated)
}

// CreateProfile creates a new profile.
// POST /v1/profile
func (h *Handler) CreateProfile(w http.ResponseWriter, r *http.Request) {
	var req models.Profile
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid JSON body")
		return
	}

	req.PhoneNumber = strings.TrimSpace(req.PhoneNumber)
	req.Name = strings.TrimSpace(req.Name)
	req.Avatar = strings.TrimSpace(req.Avatar)

	if req.PhoneNumber == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "phoneNumber is required")
		return
	}

	// Validate phoneNumber doesn't contain slashes (to prevent path traversal)
	if strings.Contains(req.PhoneNumber, "/") {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid phoneNumber")
		return
	}

	created, err := h.profileStore.CreateProfile(req)
	if err != nil {
		if strings.Contains(err.Error(), "already exists") {
			writeError(w, http.StatusConflict, "CONFLICT", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL", "could not create profile")
		return
	}

	writeJSON(w, http.StatusCreated, created)
}
