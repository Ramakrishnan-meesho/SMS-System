# Manual Testing Guide - SMS System

This guide provides comprehensive step-by-step instructions for testing the SMS system from basic to advanced scenarios, covering the entire workflow including Phase 1 and Phase 3 enhancements.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Basic Testing](#basic-testing)
3. [Intermediate Testing](#intermediate-testing)
4. [Advanced Testing](#advanced-testing)
5. [End-to-End Workflow Testing](#end-to-end-workflow-testing)
6. [Performance & Load Testing](#performance--load-testing)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### 1. Start Infrastructure

```bash
docker-compose up -d
```

Verify services are running:

```bash
docker ps
```

Expected services:

- MongoDB (port 27017)
- Redis (port 6379)
- Kafka (port 9092)

### 2. Setup Kafka Topics (Phase 1 Enhancement)

```bash
# Create topics with optimized configuration
./scripts/setup-kafka-topics.sh

# Or manually:
docker exec -it kafka kafka-topics.sh --bootstrap-server localhost:9092 --create \
  --topic sms-events --partitions 9 --replication-factor 1 \
  --config compression.type=gzip --if-not-exists
```

### 3. Start Java Service

```bash
cd sms-sender
./mvnw spring-boot:run
```

Service runs on: **http://localhost:8081**

### 4. Start Go Service

```bash
cd sms-store
go run cmd/server/main.go
```

Service runs on: **http://localhost:8082**

---

## Basic Testing

### Step 1: Health Checks

#### 1.1 Check Go Service Health

**curl:**

```bash
curl http://localhost:8082/ping
```

**Expected Response (200 OK):**

```json
{
  "status": "UP"
}
```

**Postman:**

- Method: `GET`
- URL: `http://localhost:8082/ping`

#### 1.2 Check Java Service (Block Status)

**curl:**

```bash
curl http://localhost:8081/v1/block/1234567890
```

**Expected Response (200 OK):**

```json
{
  "userId": "1234567890",
  "isBlocked": false,
  "message": "User is not blocked"
}
```

**Postman:**

- Method: `GET`
- URL: `http://localhost:8081/v1/block/1234567890`

### Step 2: Clear All Messages

**curl:**

```bash
curl -X DELETE http://localhost:8082/messages
```

**Expected Response (200 OK):**

```json
{
  "message": "All messages deleted successfully",
  "deletedCount": 0
}
```

**Postman:**

- Method: `DELETE`
- URL: `http://localhost:8082/messages`

### Step 3: Send Your First SMS

**curl:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890","message":"Hello World"}'
```

**Expected Response (200 OK):**

```json
{
  "correlationId": "3080fe71-7355-4b5f-83c2-d0a693b2425c",
  "status": "PENDING",
  "timestamp": 1768457386276
}
```

**Note:** Status is now "PENDING" (Phase 3 change) - the actual status is processed asynchronously.

**Postman:**

- Method: `POST`
- URL: `http://localhost:8081/v1/sms/send`
- Headers: `Content-Type: application/json`
- Body (raw JSON):
  ```json
  {
    "phoneNumber": "1234567890",
    "message": "Hello World"
  }
  ```

**Save the `correlationId` from the response for later testing!**

### Step 4: Verify Message in Database

**Wait 3-5 seconds** for Kafka processing, then:

**curl:**

```bash
curl http://localhost:8082/v1/user/1234567890/messages
```

**Expected Response (200 OK):**

```json
[
  {
    "id": "msg-20240115103000.123456789",
    "correlationId": "3080fe71-7355-4b5f-83c2-d0a693b2425c",
    "phoneNumber": "1234567890",
    "text": "Hello World",
    "status": "SUCCESS",
    "createdAt": "2024-01-15T10:30:00Z"
  }
]
```

**Postman:**

- Method: `GET`
- URL: `http://localhost:8082/v1/user/1234567890/messages`

**Verify:**

- ✅ Message has `correlationId` field (Phase 3)
- ✅ Message has `phoneNumber` field (Phase 1 - no `userId`)
- ✅ Status is "SUCCESS" or "FAIL"
- ✅ All required fields are present

---

## Intermediate Testing

### Step 5: Block List Functionality

#### 5.1 Block a User

**curl:**

```bash
curl -X POST http://localhost:8081/v1/block/1234567890
```

**Expected Response (200 OK):**

```json
{
  "userId": "1234567890",
  "status": "blocked",
  "message": "User has been blocked"
}
```

#### 5.2 Verify User is Blocked

**curl:**

```bash
curl http://localhost:8081/v1/block/1234567890
```

**Expected Response (200 OK):**

```json
{
  "userId": "1234567890",
  "isBlocked": true,
  "message": "User is blocked"
}
```

#### 5.3 Try to Send SMS to Blocked User (Should Fail)

**curl:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890","message":"This should fail"}'
```

**Expected Response (403 Forbidden):**

```json
{
  "code": "USER_BLOCKED",
  "message": "User is blocked: 1234567890",
  "details": {},
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### 5.4 Unblock the User

**curl:**

```bash
curl -X DELETE http://localhost:8081/v1/block/1234567890
```

**Expected Response (200 OK):**

```json
{
  "userId": "1234567890",
  "status": "unblocked",
  "message": "User has been unblocked"
}
```

### Step 6: Multiple SMS Sends

#### 6.1 Send Multiple Messages

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

**Save all correlation IDs!**

#### 6.2 Wait 5 seconds for batch processing

#### 6.3 Retrieve All Messages

**curl:**

```bash
curl http://localhost:8082/v1/user/1234567890/messages
```

**Verify:**

- ✅ All 3 messages are present
- ✅ Each message has unique `id` and `correlationId`
- ✅ Messages are ordered by timestamp
- ✅ Status values are "SUCCESS" or "FAIL"

### Step 7: Test Different Phone Numbers

#### 7.1 Send SMS to Different Phone Number

**curl:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"9876543210","message":"Message for different user"}'
```

#### 7.2 Retrieve Messages for Second Phone Number

**curl:**

```bash
curl http://localhost:8082/v1/user/9876543210/messages
```

**Verify:**

- ✅ Messages for `1234567890` do NOT appear
- ✅ Only messages for `9876543210` are returned
- ✅ Phone number isolation works correctly

### Step 8: Validation Error Testing

#### 8.1 Invalid Phone Number (Too Short)

**curl:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"123","message":"Test message"}'
```

**Expected Response (400 Bad Request):**

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

#### 8.2 Invalid Phone Number (Non-Numeric)

**curl:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"abc1234567","message":"Test message"}'
```

**Expected Response (400 Bad Request):** Validation error

#### 8.3 Empty Message

**curl:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890","message":""}'
```

**Expected Response (400 Bad Request):**

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

#### 8.4 Missing Message Field

**curl:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890"}'
```

**Expected Response (400 Bad Request):** Validation error

---

## Advanced Testing

### Step 9: Correlation ID Tracking (Phase 3)

#### 9.1 Send SMS and Capture Correlation ID

**curl:**

```bash
RESPONSE=$(curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890","message":"Correlation test"}')

echo $RESPONSE | jq '.correlationId'
```

**Save the correlation ID!**

#### 9.2 Verify Correlation ID in Database

**Wait 3-5 seconds, then:**

**curl:**

```bash
curl http://localhost:8082/v1/user/1234567890/messages | jq '.[] | select(.correlationId == "YOUR_CORRELATION_ID")'
```

**Verify:**

- ✅ Correlation ID matches the one from Step 9.1
- ✅ Can track request from API call to database

#### 9.3 Check Logs for Correlation ID

**Java Service Logs:**
Look for logs containing the correlation ID:

```
correlationId=abc-123, phoneNumber=1234567890, status=SUCCESS
```

**Go Service Logs:**
Look for batch processing logs:

```
Saved batch of 50 messages to MongoDB in 45ms
```

### Step 10: Async Processing Verification (Phase 3)

#### 10.1 Measure Response Time

**curl:**

```bash
time curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890","message":"Async test"}'
```

**Expected:** Response time should be < 10ms (immediate return)

#### 10.2 Verify Status is PENDING

**curl:**

```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890","message":"Async test"}' | jq '.status'
```

**Expected:** `"PENDING"`

#### 10.3 Check Final Status in Database

**Wait 5 seconds, then:**

**curl:**

```bash
curl http://localhost:8082/v1/user/1234567890/messages | jq '.[-1].status'
```

**Expected:** `"SUCCESS"` or `"FAIL"` (not "PENDING")

### Step 11: Kafka Direct Testing

#### 11.1 Test Kafka Producer Endpoint

**curl:**

```bash
curl -X POST "http://localhost:8081/v1/kafka/test?phoneNumber=1234567890&message=Kafka%20test&status=SUCCESS"
```

**Expected Response (200 OK):**

```json
{
  "success": true,
  "message": "SMS event sent to Kafka successfully",
  "event": {
    "correlationId": "...",
    "phoneNumber": "1234567890",
    "text": "Kafka test",
    "status": "SUCCESS",
    "timestamp": 1768457386276
  },
  "offset": 123
}
```

#### 11.2 Verify Kafka Topic

**Using Docker:**

```bash
# List topics
docker exec -it kafka kafka-topics.sh --bootstrap-server localhost:9092 --list

# Describe topic
docker exec -it kafka kafka-topics.sh --bootstrap-server localhost:9092 \
  --describe --topic sms-events

# Consume messages (for testing)
docker exec -it kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic sms-events \
  --from-beginning \
  --max-messages 5
```

**Verify:**

- ✅ Topic exists with correct partition count (9 partitions)
- ✅ Compression is enabled (gzip)
- ✅ Messages are being produced

### Step 12: Batch Processing Verification (Phase 3)

#### 12.1 Send Multiple Messages Rapidly

**Script to send 100 messages:**

```bash
for i in {1..100}; do
  curl -X POST http://localhost:8081/v1/sms/send \
    -H "Content-Type: application/json" \
    -d "{\"phoneNumber\":\"1234567890\",\"message\":\"Batch test $i\"}" \
    -s > /dev/null &
done
wait
echo "Sent 100 messages"
```

#### 12.2 Check Go Service Logs

Look for batch processing logs:

```
Saved batch of 50 messages to MongoDB in 45ms
Saved batch of 50 messages to MongoDB in 42ms
```

**Verify:**

- ✅ Messages are batched (not individual writes)
- ✅ Batch size is around 50 (configurable)
- ✅ Batch timeout triggers if batch not full

#### 12.3 Verify All Messages in Database

**Wait 10 seconds, then:**

**curl:**

```bash
curl http://localhost:8082/v1/user/1234567890/messages | jq 'length'
```

**Expected:** Should see all 100 messages (or close to it)

### Step 13: List All Messages

**curl:**

```bash
curl http://localhost:8082/messages | jq '. | length'
```

**Postman:**

- Method: `GET`
- URL: `http://localhost:8082/messages`

**Use Case:** Useful for debugging and verifying all messages are stored correctly.

---

## End-to-End Workflow Testing

### Complete Test Flow

Run this complete sequence to test the entire workflow:

```bash
# 1. Clear messages
curl -X DELETE http://localhost:8082/messages

# 2. Health checks
curl http://localhost:8082/ping
curl http://localhost:8081/v1/block/1234567890

# 3. Block user
curl -X POST http://localhost:8081/v1/block/1234567890

# 4. Try to send (should fail)
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890","message":"Blocked test"}'

# 5. Unblock user
curl -X DELETE http://localhost:8081/v1/block/1234567890

# 6. Send SMS
RESPONSE=$(curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890","message":"E2E test"}')
CORRELATION_ID=$(echo $RESPONSE | jq -r '.correlationId')
echo "Correlation ID: $CORRELATION_ID"

# 7. Wait for processing
sleep 5

# 8. Verify message
curl http://localhost:8082/v1/user/1234567890/messages | \
  jq ".[] | select(.correlationId == \"$CORRELATION_ID\")"

# 9. Send multiple messages
for i in {1..5}; do
  curl -X POST http://localhost:8081/v1/sms/send \
    -H "Content-Type: application/json" \
    -d "{\"phoneNumber\":\"1234567890\",\"message\":\"Message $i\"}" \
    -s > /dev/null
done

# 10. Wait and verify
sleep 5
curl http://localhost:8082/v1/user/1234567890/messages | jq 'length'
```

---

## Performance & Load Testing

### Step 14: Load Testing

#### 14.1 Concurrent Requests Test

**Script to send 50 concurrent requests:**

```bash
for i in {1..50}; do
  curl -X POST http://localhost:8081/v1/sms/send \
    -H "Content-Type: application/json" \
    -d "{\"phoneNumber\":\"1234567890\",\"message\":\"Load test $i\"}" \
    -s > /dev/null &
done
wait
echo "Sent 50 concurrent requests"
```

**Measure:**

- Response time (should be < 10ms per request)
- Total time to send all requests
- Check Java service logs for thread pool usage

#### 14.2 High Volume Test

**Send 1000 messages:**

```bash
START=$(date +%s)
for i in {1..1000}; do
  curl -X POST http://localhost:8081/v1/sms/send \
    -H "Content-Type: application/json" \
    -d "{\"phoneNumber\":\"1234567890\",\"message\":\"Volume test $i\"}" \
    -s > /dev/null
done
END=$(date +%s)
echo "Sent 1000 messages in $((END-START)) seconds"
```

**Wait 30 seconds, then verify:**

```bash
curl http://localhost:8082/v1/user/1234567890/messages | jq 'length'
```

**Expected:** Should see close to 1000 messages

#### 14.3 Monitor Batch Processing

**Watch Go service logs for:**

- Batch flush frequency
- Batch sizes
- Processing latency

**Expected patterns:**

- Batches of ~50 messages
- Flush every ~2 seconds (or when batch full)
- Low latency per batch (< 100ms)

### Step 15: Stress Testing

#### 15.1 Multiple Phone Numbers

**Send to 10 different phone numbers:**

```bash
for phone in {1234567890..1234567899}; do
  for i in {1..10}; do
    curl -X POST http://localhost:8081/v1/sms/send \
      -H "Content-Type: application/json" \
      -d "{\"phoneNumber\":\"$phone\",\"message\":\"Stress test $i\"}" \
      -s > /dev/null &
  done
done
wait
```

#### 15.2 Verify Partition Distribution

**Check Kafka partitions:**

```bash
docker exec -it kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --group sms-store-consumer-group \
  --describe
```

**Verify:**

- ✅ Messages distributed across partitions
- ✅ Consumer lag is low
- ✅ All partitions are being consumed

---

## Troubleshooting

### Messages Not Appearing

1. **Check Go Service Logs:**

   ```bash
   # Look for:
   # "Kafka consumer started successfully"
   # "Saved batch of X messages to MongoDB"
   ```

2. **Wait Longer:**

   - Batch processing may delay writes
   - Wait 5-10 seconds for batches to flush

3. **Check Kafka:**

   ```bash
   docker exec -it kafka kafka-console-consumer.sh \
     --bootstrap-server localhost:9092 \
     --topic sms-events \
     --from-beginning \
     --max-messages 1
   ```

4. **Check MongoDB:**
   ```bash
   docker exec -it mongo mongosh sms_store --eval "db.messages.countDocuments()"
   ```

### Block List Not Working

1. **Check Redis:**

   ```bash
   docker exec -it redis redis-cli ping
   # Should return: PONG

   docker exec -it redis redis-cli KEYS "blocked:user:*"
   ```

2. **Check Java Service Logs:**
   - Look for Redis connection errors
   - Verify block list operations

### Async Processing Issues

1. **Check Response Time:**

   - Should be < 10ms
   - If slower, check thread pool configuration

2. **Verify Status Flow:**

   - Initial: "PENDING"
   - Final (in DB): "SUCCESS" or "FAIL"

3. **Check Thread Pool:**
   - Monitor Java service logs for thread pool usage
   - Adjust pool size in `application.yml` if needed

### Batch Processing Issues

1. **Check Batch Size:**

   - Default: 50 messages
   - Check Go service logs for actual batch sizes

2. **Check Batch Timeout:**

   - Default: 2 seconds
   - Messages should flush even if batch not full

3. **Monitor MongoDB Writes:**
   - Should see bulk inserts, not individual inserts
   - Check Go service logs for batch write times

### Correlation ID Not Found

1. **Verify Correlation ID Format:**

   - Should be UUID format
   - Check response from SMS send endpoint

2. **Check Database:**

   ```bash
   curl http://localhost:8082/v1/user/1234567890/messages | \
     jq '.[] | .correlationId'
   ```

3. **Search by Correlation ID:**
   ```bash
   curl http://localhost:8082/messages | \
     jq ".[] | select(.correlationId == \"YOUR_CORRELATION_ID\")"
   ```

---

## Quick Reference

### Endpoints Summary

| Service | Method | Endpoint                          | Purpose             |
| ------- | ------ | --------------------------------- | ------------------- |
| Go      | GET    | `/ping`                           | Health check        |
| Go      | GET    | `/v1/user/{phoneNumber}/messages` | Get user messages   |
| Go      | GET    | `/messages`                       | List all messages   |
| Go      | DELETE | `/messages`                       | Delete all messages |
| Java    | GET    | `/v1/block/{phoneNumber}`         | Check block status  |
| Java    | POST   | `/v1/block/{phoneNumber}`         | Block user          |
| Java    | DELETE | `/v1/block/{phoneNumber}`         | Unblock user        |
| Java    | POST   | `/v1/sms/send`                    | Send SMS            |
| Java    | POST   | `/v1/kafka/test`                  | Test Kafka producer |

### Response Status Codes

- `200 OK`: Success
- `400 Bad Request`: Validation error
- `403 Forbidden`: User blocked
- `500 Internal Server Error`: Server error

### Key Fields (Phase 1 & 3 Updates)

- `correlationId`: UUID for request tracking (Phase 3)
- `phoneNumber`: Primary identifier (Phase 1 - no `userId`)
- `status`: "PENDING" initially, then "SUCCESS" or "FAIL" (Phase 3)

---

## Postman Collection Setup

### Creating a Postman Collection

1. Create a new collection: "SMS System Tests"
2. Add folders:
   - **Setup** (Health checks, Clear messages)
   - **Block List** (Block, Unblock, Check status)
   - **Send SMS** (Send messages, verify async)
   - **Retrieve Messages** (Get user messages, list all)
   - **Validation Tests** (Invalid inputs)
   - **Advanced** (Correlation ID, batch processing)
   - **Load Testing** (Concurrent requests, high volume)
3. Add all requests from this guide
4. Save collection

### Environment Variables

Create a Postman environment with:

- `java_service`: `http://localhost:8081`
- `go_service`: `http://localhost:8082`
- `test_phone`: `1234567890`
- `test_phone_2`: `9876543210`

Then use: `{{java_service}}/v1/sms/send`

### Pre-request Scripts

For correlation ID tracking:

```javascript
// Generate correlation ID
pm.environment.set("correlation_id", pm.variables.replaceIn("{{$randomUUID}}"));
```

### Tests

Add tests to verify:

- Status code is 200
- Response has `correlationId`
- Response status is "PENDING" (for SMS send)
- Response time < 100ms (for SMS send)

---

**Happy Testing! 🚀**

For issues or questions, check the troubleshooting section or review service logs.
