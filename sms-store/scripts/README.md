# MongoDB Migration Scripts

## migrate_remove_userid.js

This script migrates the MongoDB database to remove the `userId` field and update indexes to use `phoneNumber` as the primary identifier.

### What it does:

1. Removes the `userId` field from all documents in the `messages` collection
2. Drops the old `userId_idx` index
3. Creates a new `phoneNumber_idx` index (if it doesn't exist)

### Usage:

**Option 1: Using mongo shell directly**
```bash
mongo sms_store scripts/migrate_remove_userid.js
```

**Option 2: With connection string**
```bash
mongo "mongodb://localhost:27017/sms_store" scripts/migrate_remove_userid.js
```

**Option 3: Using mongosh (MongoDB Shell 6.0+)**
```bash
mongosh mongodb://localhost:27017/sms_store scripts/migrate_remove_userid.js
```

### Before Running:

1. **Backup your database** (recommended):
   ```bash
   mongodump --db sms_store --out /path/to/backup
   ```

2. Ensure MongoDB is running and accessible

3. Verify you have write permissions to the database

### After Running:

1. Verify the migration:
   ```bash
   mongo sms_store --eval "db.messages.findOne()"
   ```

2. Check indexes:
   ```bash
   mongo sms_store --eval "db.messages.getIndexes()"
   ```

### Notes:

- The script is idempotent - it's safe to run multiple times
- Documents without `userId` field will be skipped
- The script will report any errors but continue execution
