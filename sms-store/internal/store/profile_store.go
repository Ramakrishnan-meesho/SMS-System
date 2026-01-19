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

// ProfileStore defines the interface for profile storage operations.
type ProfileStore interface {
	// GetProfile retrieves a profile by phone number.
	// Returns an error if profile is not found.
	GetProfile(phoneNumber string) (models.Profile, error)

	// UpdateProfile updates an existing profile.
	// Returns an error if profile is not found.
	UpdateProfile(phoneNumber string, profile models.Profile) (models.Profile, error)

	// CreateProfile creates a new profile.
	// Returns an error if profile already exists.
	CreateProfile(profile models.Profile) (models.Profile, error)
}

// MongoProfileStore implements the ProfileStore interface using MongoDB.
type MongoProfileStore struct {
	client     *mongo.Client
	database   *mongo.Database
	collection *mongo.Collection
}

// NewMongoProfileStore creates a new MongoDB profile store instance.
// It uses the same MongoDB connection as the message store.
func NewMongoProfileStore(client *mongo.Client, databaseName, collectionName string) *MongoProfileStore {
	if collectionName == "" {
		collectionName = "profiles"
	}

	database := client.Database(databaseName)
	collection := database.Collection(collectionName)

	// Create unique index on phoneNumber
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	indexModel := mongo.IndexModel{
		Keys:    bson.D{{Key: "phoneNumber", Value: 1}},
		Options: options.Index().SetUnique(true).SetName("phoneNumber_unique_idx"),
	}
	_, _ = collection.Indexes().CreateOne(ctx, indexModel)

	return &MongoProfileStore{
		client:     client,
		database:   database,
		collection: collection,
	}
}

// GetProfile retrieves a profile by phone number from MongoDB.
func (s *MongoProfileStore) GetProfile(phoneNumber string) (models.Profile, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.M{"phoneNumber": phoneNumber}

	var profile models.Profile
	err := s.collection.FindOne(ctx, filter).Decode(&profile)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return models.Profile{}, fmt.Errorf("profile not found for phone number: %s", phoneNumber)
		}
		return models.Profile{}, fmt.Errorf("failed to get profile: %w", err)
	}

	return profile, nil
}

// UpdateProfile updates an existing profile in MongoDB.
func (s *MongoProfileStore) UpdateProfile(phoneNumber string, profile models.Profile) (models.Profile, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Ensure phoneNumber matches
	profile.PhoneNumber = phoneNumber
	profile.UpdatedAt = time.Now()

	// Keep CreatedAt from existing profile if it exists
	filter := bson.M{"phoneNumber": phoneNumber}
	var existingProfile models.Profile
	err := s.collection.FindOne(ctx, filter).Decode(&existingProfile)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return models.Profile{}, fmt.Errorf("profile not found for phone number: %s", phoneNumber)
		}
		return models.Profile{}, fmt.Errorf("failed to check existing profile: %w", err)
	}

	// Preserve CreatedAt from existing profile
	profile.CreatedAt = existingProfile.CreatedAt

	// Update the profile
	update := bson.M{
		"$set": bson.M{
			"name":      profile.Name,
			"avatar":    profile.Avatar,
			"updatedAt": profile.UpdatedAt,
		},
	}

	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updatedProfile models.Profile
	err = s.collection.FindOneAndUpdate(ctx, filter, update, opts).Decode(&updatedProfile)
	if err != nil {
		return models.Profile{}, fmt.Errorf("failed to update profile: %w", err)
	}

	return updatedProfile, nil
}

// CreateProfile creates a new profile in MongoDB.
func (s *MongoProfileStore) CreateProfile(profile models.Profile) (models.Profile, error) {
	if profile.PhoneNumber == "" {
		return models.Profile{}, errors.New("phoneNumber is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Check if profile already exists
	filter := bson.M{"phoneNumber": profile.PhoneNumber}
	var existingProfile models.Profile
	err := s.collection.FindOne(ctx, filter).Decode(&existingProfile)
	if err == nil {
		return models.Profile{}, fmt.Errorf("profile already exists for phone number: %s", profile.PhoneNumber)
	}
	if err != mongo.ErrNoDocuments {
		return models.Profile{}, fmt.Errorf("failed to check existing profile: %w", err)
	}

	// Set timestamps
	now := time.Now()
	profile.CreatedAt = now
	profile.UpdatedAt = now

	_, err = s.collection.InsertOne(ctx, profile)
	if err != nil {
		// Check for duplicate key error
		if mongo.IsDuplicateKeyError(err) {
			return models.Profile{}, fmt.Errorf("profile already exists for phone number: %s", profile.PhoneNumber)
		}
		return models.Profile{}, fmt.Errorf("failed to create profile: %w", err)
	}

	return profile, nil
}
