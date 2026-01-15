# Manual Testing Guide - SMS System

This guide provides step-by-step instructions for testing the SMS system using Postman or curl.

## Prerequisites

1. **Start Infrastructure:**

   ```bash
   docker-compose up -d
   ```

2. **Start Java Service:**

   ```bash
   cd sms-sender
   ./mvnw spring-boot:run
   ```

   Service runs on: **http://localhost:8081**

3. **Start Go Service:**
   ```bash
   cd sms-store
   go run cmd/server/main.go
   ```
   Service runs on: **http://localhost:8082**

---

## Step 1: Clear All Existing Messages

**Purpose:** Start with a clean database for testing.

### Using Postman:

1. **Method:** `DELETE`
2. **URL:** `http://localhost:8082/messages`
3. **Headers:** None required
4. **Body:** None
5. **Expected Response (200 OK):**
   ```json
   {
     "message": "All messages deleted successfully",
     "deletedCount": 0
   }
   ```

### Using curl:

```bash
curl -X DELETE http://localhost:8082/messages
```

---

## Step 2: Verify Services Are Running

### 2.1 Check Go Service Health

**Postman:**

- **Method:** `GET`
- **URL:** `http://localhost:8082/ping`
- **Expected Response (200 OK):**
  ```json
  {
    "status": "UP"
  }
  ```

**curl:**

```bash
curl http://localhost:8082/ping
```

### 2.2 Check Java Service (Block Status)

**Postman:**

- **Method:** `GET`
- **URL:** `http://localhost:8081/v1/block/1234567890`
- **Expected Response (200 OK):**
  ```json
  {
    "userId": "1234567890",
    "isBlocked": false
  }
  ```

**curl:**

```bash
curl http://localhost:8081/v1/block/1234567890
```

---

## Step 3: Test Block List Functionality

### 3.1 Block a User

**Postman:**

- **Method:** `POST`
- **URL:** `http://localhost:8081/v1/block/1234567890`
- **Headers:** None required
- **Body:** None
- **Expected Response (200 OK):**
  ```json
  {
    "userId": "1234567890",
    "status": "blocked"
  }
  ```

**curl:**

```bash
curl -X POST http://localhost:8081/v1/block/1234567890
```

### 3.2 Verify User is Blocked

**Postman:**

- **Method:** `GET`
- **URL:** `http://localhost:8081/v1/block/1234567890`
- **Expected Response (200 OK):**
  ```json
  {
    "userId": "1234567890",
    "isBlocked": true
  }
  ```

**curl:**

```bash
curl http://localhost:8081/v1/block/1234567890
```

### 3.3 Try to Send SMS to Blocked User (Should Fail)

**Postman:**

- **Method:** `POST`
- **URL:** `http://localhost:8081/v1/sms/send`
- **Headers:**
  - `Content-Type: application/json`
- **Body (raw JSON):**
  ```json
  {
    "phoneNumber": "1234567890",
    "message": "This should fail"
  }
  ```
- **Expected Response (403 Forbidden):**
  ```json
  {
    "code": "USER_BLOCKED",
    "message": "User is blocked: 1234567890",
    "details": {},
    "timestamp": "2024-01-15T10:30:00Z"
  }
  ```

**curl:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890","message":"This should fail"}'
```

### 3.4 Unblock the User

**Postman:**

- **Method:** `DELETE`
- **URL:** `http://localhost:8081/v1/block/1234567890`
- **Headers:** None required
- **Body:** None
- **Expected Response (200 OK):**
  ```json
  {
    "userId": "1234567890",
    "status": "unblocked"
  }
  ```

**curl:**

```bash
curl -X DELETE http://localhost:8081/v1/block/1234567890
```

### 3.5 Verify User is Unblocked

**Postman:**

- **Method:** `GET`
- **URL:** `http://localhost:8081/v1/block/1234567890`
- **Expected Response (200 OK):**
  ```json
  {
    "userId": "1234567890",
    "isBlocked": false
  }
  ```

**curl:**

```bash
curl http://localhost:8081/v1/block/1234567890
```

---

## Step 4: Test SMS Sending (Success Scenario)

### 4.1 Send SMS (Should Succeed)

**Postman:**

- **Method:** `POST`
- **URL:** `http://localhost:8081/v1/sms/send`
- **Headers:**
  - `Content-Type: application/json`
- **Body (raw JSON):**
  ```json
  {
    "phoneNumber": "1234567890",
    "message": "Hello World"
  }
  ```
- **Expected Response (200 OK):**
  ```json
  {
    "requestId": "3080fe71-7355-4b5f-83c2-d0a693b2425c",
    "status": "SUCCESS",
    "timestamp": 1768457386276
  }
  ```
  **Note:** Status may be "SUCCESS" or "FAIL" (random 50/50 chance)

**curl:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890","message":"Hello World"}'
```

### 4.2 Wait for Kafka Processing

**Important:** Wait 3-5 seconds after sending SMS for Kafka consumer to process the event and save to MongoDB.

### 4.3 Verify Message in MongoDB (via Go Service)

**Postman:**

- **Method:** `GET`
- **URL:** `http://localhost:8082/v1/user/1234567890/messages`
- **Expected Response (200 OK):**
  ```json
  [
    {
      "id": "msg-20240115103000.123456789",
      "userId": "1234567890",
      "phoneNumber": "1234567890",
      "text": "Hello World",
      "status": "SUCCESS",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
  ```

**curl:**

```bash
curl http://localhost:8082/v1/user/1234567890/messages
```

---

## Step 5: Test Multiple SMS Sends

### 5.1 Send Multiple SMS Messages

Send 3-5 SMS messages with different content:

**Message 1:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890","message":"First message"}'
```

**Message 2:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890","message":"Second message"}'
```

**Message 3:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890","message":"Third message"}'
```

### 5.2 Wait 5 seconds

### 5.3 Retrieve All Messages for User

**Postman:**

- **Method:** `GET`
- **URL:** `http://localhost:8082/v1/user/1234567890/messages`
- **Expected Response:** Array with all messages

**curl:**

```bash
curl http://localhost:8082/v1/user/1234567890/messages
```

**Verify:**

- All messages are present
- Each message has unique `id`
- Status values are either "SUCCESS" or "FAIL"
- Timestamps are correct

---

## Step 6: Test Validation Errors

### 6.1 Invalid Phone Number (Too Short)

**Postman:**

- **Method:** `POST`
- **URL:** `http://localhost:8081/v1/sms/send`
- **Headers:**
  - `Content-Type: application/json`
- **Body (raw JSON):**
  ```json
  {
    "phoneNumber": "123",
    "message": "Test message"
  }
  ```
- **Expected Response (400 Bad Request):**
  ```json
  {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "phoneNumber": "phoneNumber must be exactly 10 digits"
    },
    "timestamp": "2024-01-15T10:30:00Z"
  }
  ```

**curl:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"123","message":"Test message"}'
```

### 6.2 Invalid Phone Number (Non-Numeric)

**Postman:**

- **Method:** `POST`
- **URL:** `http://localhost:8081/v1/sms/send`
- **Body (raw JSON):**
  ```json
  {
    "phoneNumber": "abc1234567",
    "message": "Test message"
  }
  ```
- **Expected Response (400 Bad Request):** Validation error

**curl:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"abc1234567","message":"Test message"}'
```

### 6.3 Empty Message

**Postman:**

- **Method:** `POST`
- **URL:** `http://localhost:8081/v1/sms/send`
- **Body (raw JSON):**
  ```json
  {
    "phoneNumber": "1234567890",
    "message": ""
  }
  ```
- **Expected Response (400 Bad Request):**
  ```json
  {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "message": "message must not be blank"
    },
    "timestamp": "2024-01-15T10:30:00Z"
  }
  ```

**curl:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890","message":""}'
```

### 6.4 Missing Message Field

**Postman:**

- **Method:** `POST`
- **URL:** `http://localhost:8081/v1/sms/send`
- **Body (raw JSON):**
  ```json
  {
    "phoneNumber": "1234567890"
  }
  ```
- **Expected Response (400 Bad Request):** Validation error

**curl:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890"}'
```

---

## Step 7: Test Different Users

### 7.1 Send SMS to Different User

**Postman:**

- **Method:** `POST`
- **URL:** `http://localhost:8081/v1/sms/send`
- **Body (raw JSON):**
  ```json
  {
    "phoneNumber": "9876543210",
    "message": "Message for different user"
  }
  ```

**curl:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"9876543210","message":"Message for different user"}'
```

### 7.2 Wait 5 seconds

### 7.3 Retrieve Messages for Second User

**Postman:**

- **Method:** `GET`
- **URL:** `http://localhost:8082/v1/user/9876543210/messages`
- **Expected Response:** Array with messages for this user only

**curl:**

```bash
curl http://localhost:8082/v1/user/9876543210/messages
```

### 7.4 Verify User Isolation

- Messages for `1234567890` should not appear in `9876543210`'s messages
- Messages for `9876543210` should not appear in `1234567890`'s messages

---

## Step 8: Test List All Messages (Testing Endpoint)

**Postman:**

- **Method:** `GET`
- **URL:** `http://localhost:8082/messages`
- **Expected Response:** Array with all messages from all users

**curl:**

```bash
curl http://localhost:8082/messages
```

**Use Case:** Useful for debugging and verifying all messages are stored correctly.

---

## Complete Test Flow Summary

Here's the complete flow to test everything:

1. ✅ **Clear Messages:** `DELETE http://localhost:8082/messages`
2. ✅ **Check Services:** `GET http://localhost:8082/ping` and `GET http://localhost:8081/v1/block/test`
3. ✅ **Block User:** `POST http://localhost:8081/v1/block/1234567890`
4. ✅ **Verify Blocked:** `GET http://localhost:8081/v1/block/1234567890`
5. ✅ **Try Send (Should Fail):** `POST http://localhost:8081/v1/sms/send` with blocked user
6. ✅ **Unblock User:** `DELETE http://localhost:8081/v1/block/1234567890`
7. ✅ **Send SMS:** `POST http://localhost:8081/v1/sms/send` with valid data
8. ✅ **Wait 5 seconds** for Kafka processing
9. ✅ **Retrieve Messages:** `GET http://localhost:8082/v1/user/1234567890/messages`
10. ✅ **Verify Message:** Check message is stored with correct fields
11. ✅ **Test Validation:** Try invalid phone numbers and empty messages
12. ✅ **Test Multiple Users:** Send to different users and verify isolation

---

## Postman Collection Setup

### Creating a Postman Collection

1. Create a new collection: "SMS System Tests"
2. Add folders:
   - "Setup" (Clear messages, Health checks)
   - "Block List" (Block, Unblock, Check status)
   - "Send SMS" (Send messages)
   - "Retrieve Messages" (Get user messages)
   - "Validation Tests" (Invalid inputs)
3. Add all requests from this guide
4. Save collection

### Environment Variables (Optional)

Create a Postman environment with:

- `java_service`: `http://localhost:8081`
- `go_service`: `http://localhost:8082`
- `test_user`: `1234567890`

Then use: `{{java_service}}/v1/sms/send`

---

## Troubleshooting During Manual Testing

### Messages Not Appearing

1. **Check Go Service Logs:** Look for "Kafka consumer started successfully"
2. **Wait Longer:** Kafka processing may take 3-5 seconds
3. **Check Kafka Topic:** Verify messages are being published
4. **Check MongoDB:** Verify connection is working

### Block List Not Working

1. **Check Redis:** `redis-cli ping` should return `PONG`
2. **Check Redis Keys:** `redis-cli KEYS "blocked:user:*"`
3. **Verify Java Service Logs:** Check for Redis connection errors

### Validation Errors Not Showing

1. **Check Request Headers:** Must include `Content-Type: application/json`
2. **Check JSON Format:** Ensure valid JSON syntax
3. **Check Java Service Logs:** Look for validation errors

---

**Happy Testing! 🚀**
