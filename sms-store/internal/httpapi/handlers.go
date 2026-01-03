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
	store *store.MemoryStore
}

func NewHandler(s *store.MemoryStore) *Handler {
	return &Handler{store: s}
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
	UserID      string `json:"userId"`
	PhoneNumber string `json:"phoneNumber"`
	Text        string `json:"text"`
}

func (h *Handler) CreateMessage(w http.ResponseWriter, r *http.Request) {
	var req createMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "invalid JSON body")
		return
	}

	req.UserID = strings.TrimSpace(req.UserID)
	req.PhoneNumber = strings.TrimSpace(req.PhoneNumber)
	req.Text = strings.TrimSpace(req.Text)

	if req.UserID == "" {
		writeError(w, http.StatusBadRequest, "BAD_REQUEST", "userId is required")
		return
	}
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
		UserID:      req.UserID,
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
