package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"sms-store/internal/httpapi"
	"sms-store/internal/kafka"
	"sms-store/internal/store"
)

func main() {
	// MongoDB connection configuration
	connectionString := getEnv("MONGODB_URI", "mongodb://localhost:27017")
	databaseName := getEnv("MONGODB_DATABASE", "sms_store")
	collectionName := getEnv("MONGODB_COLLECTION", "messages")

	// Initialize MongoDB store
	log.Println("Connecting to MongoDB...")
	mongoStore, err := store.NewMongoStore(connectionString, databaseName, collectionName)
	if err != nil {
		log.Fatalf("Failed to connect to MongoDB: %v", err)
	}
	log.Println("Successfully connected to MongoDB")

	// Ensure MongoDB connection is closed on shutdown
	defer func() {
		log.Println("Closing MongoDB connection...")
		if err := mongoStore.Close(); err != nil {
			log.Printf("Error closing MongoDB connection: %v", err)
		}
	}()

	// Initialize ProfileStore
	profileCollectionName := getEnv("MONGODB_PROFILE_COLLECTION", "profiles")
	profileStore := store.NewMongoProfileStore(
		mongoStore.GetClient(),
		mongoStore.GetDatabaseName(),
		profileCollectionName,
	)
	log.Println("ProfileStore initialized")

	// Create handler with MongoDB store and ProfileStore
	h := httpapi.NewHandler(mongoStore, profileStore)

	// Initialize Kafka consumer
	kafkaBrokers := getEnv("KAFKA_BROKERS", "localhost:9092")
	kafkaGroupID := getEnv("KAFKA_GROUP_ID", "sms-store-consumer-group")
	kafkaTopic := getEnv("KAFKA_TOPIC", "sms-events")

	log.Println("Initializing Kafka consumer...")
	kafkaConsumer, err := kafka.NewConsumer(
		strings.Split(kafkaBrokers, ","),
		kafkaGroupID,
		kafkaTopic,
		mongoStore,
	)
	if err != nil {
		log.Fatalf("Failed to create Kafka consumer: %v", err)
	}

	// Start Kafka consumer in background
	if err := kafkaConsumer.Start(); err != nil {
		log.Fatalf("Failed to start Kafka consumer: %v", err)
	}

	// Ensure Kafka consumer is stopped on shutdown
	defer func() {
		log.Println("Stopping Kafka consumer...")
		if err := kafkaConsumer.Stop(); err != nil {
			log.Printf("Error stopping Kafka consumer: %v", err)
		}
	}()

	mux := http.NewServeMux()

	// CORS middleware
	corsMiddleware := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			// Set CORS headers
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Max-Age", "3600")

			// Handle preflight requests
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusOK)
				return
			}

			next(w, r)
		}
	}

	// GET /ping - Health check endpoint
	mux.HandleFunc("/ping", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		h.Ping(w, r)
	}))

	// GET /v1/conversations - Get all distinct phone numbers (conversations)
	mux.HandleFunc("/v1/conversations", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		h.GetConversations(w, r)
	}))

	// GET /v1/user/{user_id}/messages - Required endpoint for SMS Store
	// DELETE /v1/user/{user_id}/messages - Delete all messages for a conversation
	mux.HandleFunc("/v1/user/", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		// Only handle paths that end with /messages
		if !strings.HasSuffix(r.URL.Path, "/messages") {
			http.NotFound(w, r)
			return
		}

		switch r.Method {
		case http.MethodGet:
			h.GetUserMessages(w, r)
		case http.MethodDelete:
			h.DeleteUserMessages(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// GET /v1/profile/{phoneNumber} - Get profile
	// PUT /v1/profile/{phoneNumber} - Update profile
	mux.HandleFunc("/v1/profile/", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			h.GetProfile(w, r)
		case http.MethodPut:
			h.UpdateProfile(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// POST /v1/profile - Create profile
	mux.HandleFunc("/v1/profile", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		h.CreateProfile(w, r)
	}))

	// POST /messages, GET /messages, DELETE /messages - Optional endpoints for testing
	mux.HandleFunc("/messages", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			h.CreateMessage(w, r)
		case http.MethodGet:
			h.ListMessages(w, r)
		case http.MethodDelete:
			h.DeleteAllMessages(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	addr := ":8082"
	server := &http.Server{
		Addr:    addr,
		Handler: mux,
	}

	// Setup graceful shutdown
	sigint := make(chan os.Signal, 1)
	signal.Notify(sigint, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-sigint

		log.Println("Shutting down server...")

		// Stop Kafka consumer first
		if err := kafkaConsumer.Stop(); err != nil {
			log.Printf("Error stopping Kafka consumer: %v", err)
		}

		// Then close HTTP server
		if err := server.Close(); err != nil {
			log.Printf("Error closing server: %v", err)
		}
	}()

	log.Println("sms-store server started at", addr)
	log.Println("Available endpoints:")
	log.Println("  GET    /ping")
	log.Println("  GET    /v1/conversations")
	log.Println("  GET    /v1/user/{user_id}/messages")
	log.Println("  DELETE /v1/user/{user_id}/messages")
	log.Println("  GET    /v1/profile/{phoneNumber}")
	log.Println("  PUT    /v1/profile/{phoneNumber}")
	log.Println("  POST   /v1/profile")
	log.Println("  POST   /messages (testing only)")
	log.Println("  GET    /messages (testing only)")
	log.Println("  DELETE /messages (testing only - clears all messages)")
	log.Println("Kafka consumer listening on topic:", kafkaTopic)

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}

	log.Println("Server stopped")
}

// getEnv retrieves an environment variable or returns a default value.
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
