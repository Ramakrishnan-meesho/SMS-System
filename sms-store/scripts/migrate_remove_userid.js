/**
 * MongoDB Migration Script: Remove userId field and update indexes
 * 
 * This script:
 * 1. Removes the userId field from all documents in the messages collection
 * 2. Drops the old userId index
 * 3. Creates a new phoneNumber index (if it doesn't exist)
 * 
 * Usage:
 *   mongo sms_store scripts/migrate_remove_userid.js
 * 
 * Or with connection string:
 *   mongo "mongodb://localhost:27017/sms_store" scripts/migrate_remove_userid.js
 */

// Connect to the database
db = db.getSiblingDB('sms_store');
const collection = db.messages;

print("Starting migration: Remove userId field and update indexes...");
print("Collection: " + collection.getName());

// Step 1: Count documents with userId field
const countWithUserId = collection.countDocuments({ userId: { $exists: true } });
print("Documents with userId field: " + countWithUserId);

if (countWithUserId === 0) {
    print("No documents with userId field found. Migration may have already been run.");
} else {
    // Step 2: Remove userId field from all documents
    print("Removing userId field from all documents...");
    const result = collection.updateMany(
        { userId: { $exists: true } },
        { $unset: { userId: "" } }
    );
    print("Updated " + result.modifiedCount + " documents");
}

// Step 3: Drop old userId index if it exists
print("Dropping old userId index...");
try {
    const dropResult = collection.dropIndex("userId_idx");
    print("Dropped userId index: " + dropResult);
} catch (e) {
    if (e.message.includes("index not found")) {
        print("userId index does not exist (already dropped or never created)");
    } else {
        print("Error dropping userId index: " + e.message);
    }
}

// Step 4: Create phoneNumber index if it doesn't exist
print("Creating phoneNumber index...");
try {
    const indexResult = collection.createIndex(
        { phoneNumber: 1 },
        { name: "phoneNumber_idx" }
    );
    print("Created phoneNumber index: " + indexResult);
} catch (e) {
    if (e.message.includes("already exists")) {
        print("phoneNumber index already exists");
    } else {
        print("Error creating phoneNumber index: " + e.message);
    }
}

// Step 5: Verify migration
print("\nVerification:");
const remainingWithUserId = collection.countDocuments({ userId: { $exists: true } });
print("Documents still with userId field: " + remainingWithUserId);

const indexes = collection.getIndexes();
print("\nCurrent indexes:");
indexes.forEach(function(index) {
    print("  - " + JSON.stringify(index));
});

if (remainingWithUserId === 0) {
    print("\n✓ Migration completed successfully!");
} else {
    print("\n⚠ Warning: Some documents still have userId field. Please review.");
}
