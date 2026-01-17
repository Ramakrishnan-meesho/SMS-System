package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"sms-store/internal/models"
)

// MongoStore implements the Store interface using MongoDB.
type MongoStore struct {
	client     *mongo.Client
	database   *mongo.Database
	collection *mongo.Collection
}

// NewMongoStore creates a new MongoDB store instance.
// It connects to MongoDB at the provided connection string.
// If connection fails, returns an error.
func NewMongoStore(connectionString, databaseName, collectionName string) (*MongoStore, error) {
	if connectionString == "" {
		connectionString = "mongodb://localhost:27017"
	}
	if databaseName == "" {
		databaseName = "sms_store"
	}
	if collectionName == "" {
		collectionName = "messages"
	}

	// Create context with timeout for connection
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Connect to MongoDB
	clientOptions := options.Client().ApplyURI(connectionString)
	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return nil, err
	}

	// Verify connection
	err = client.Ping(ctx, nil)
	if err != nil {
		return nil, err
	}

	database := client.Database(databaseName)
	collection := database.Collection(collectionName)

	// Create index on phoneNumber for faster queries
	indexModel := mongo.IndexModel{
		Keys:    bson.D{{Key: "phoneNumber", Value: 1}},
		Options: options.Index().SetName("phoneNumber_idx"),
	}
	_, err = collection.Indexes().CreateOne(ctx, indexModel)
	if err != nil {
		// Log error but don't fail - index might already exist
		// In production, you'd want proper logging here
	}

	return &MongoStore{
		client:     client,
		database:   database,
		collection: collection,
	}, nil
}

// Save stores a message in MongoDB.
func (s *MongoStore) Save(msg models.Message) (models.Message, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := s.collection.InsertOne(ctx, msg)
	if err != nil {
		return models.Message{}, err
	}

	return msg, nil
}

// SaveBatch stores multiple messages in MongoDB using bulk insert for better performance.
func (s *MongoStore) SaveBatch(msgs []models.Message) (int, error) {
	if len(msgs) == 0 {
		return 0, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Convert to []interface{} for InsertMany
	documents := make([]interface{}, len(msgs))
	for i := range msgs {
		documents[i] = msgs[i]
	}

	// Use ordered=false to continue inserting even if some documents fail
	opts := options.InsertMany().SetOrdered(false)
	result, err := s.collection.InsertMany(ctx, documents, opts)
	if err != nil {
		// Check if it's a bulk write error with partial success
		var bulkErr mongo.BulkWriteException
		if errors.As(err, &bulkErr) {
			// Return count of successfully inserted documents
			return len(result.InsertedIDs), fmt.Errorf("partial batch insert: %w", err)
		}
		return 0, fmt.Errorf("failed to insert batch: %w", err)
	}

	return len(result.InsertedIDs), nil
}

// FindByPhoneNumber retrieves all messages for a specific phone number from MongoDB.
func (s *MongoStore) FindByPhoneNumber(phoneNumber string) ([]models.Message, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"phoneNumber": phoneNumber}

	cursor, err := s.collection.Find(ctx, filter)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var messages []models.Message
	if err := cursor.All(ctx, &messages); err != nil {
		return nil, err
	}

	// Return empty slice instead of nil if no messages found
	if messages == nil {
		messages = []models.Message{}
	}

	return messages, nil
}

// List retrieves all messages from MongoDB (used for testing/debugging).
func (s *MongoStore) List() ([]models.Message, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cursor, err := s.collection.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var messages []models.Message
	if err := cursor.All(ctx, &messages); err != nil {
		return nil, err
	}

	// Return empty slice instead of nil if no messages found
	if messages == nil {
		messages = []models.Message{}
	}

	return messages, nil
}

// DeleteAll removes all messages from MongoDB.
func (s *MongoStore) DeleteAll() (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result, err := s.collection.DeleteMany(ctx, bson.M{})
	if err != nil {
		return 0, err
	}

	return result.DeletedCount, nil
}

// GetDistinctPhoneNumbers retrieves all distinct phone numbers from MongoDB.
func (s *MongoStore) GetDistinctPhoneNumbers() ([]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Use MongoDB's Distinct operation to get unique phone numbers
	phoneNumbers, err := s.collection.Distinct(ctx, "phoneNumber", bson.M{})
	if err != nil {
		return nil, fmt.Errorf("failed to get distinct phone numbers: %w", err)
	}

	// Convert []interface{} to []string
	result := make([]string, 0, len(phoneNumbers))
	for _, pn := range phoneNumbers {
		if str, ok := pn.(string); ok && str != "" {
			result = append(result, str)
		}
	}

	// Return empty slice instead of nil if no phone numbers found
	if result == nil {
		result = []string{}
	}

	return result, nil
}

// Close closes the MongoDB connection.
// Should be called when shutting down the service.
func (s *MongoStore) Close() error {
	if s.client == nil {
		return errors.New("client is nil")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return s.client.Disconnect(ctx)
}
