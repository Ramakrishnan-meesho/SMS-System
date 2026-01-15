# SMS System - Polyglot Distributed Microservices

A distributed SMS notification system consisting of two microservices: an SMS Sender service (Java/Spring Boot) and an SMS Store service (Go/net/http), communicating via Kafka for event-driven architecture.

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [API Documentation](#api-documentation)
- [Configuration](#configuration)
- [Testing Guide](#testing-guide)
- [Troubleshooting](#troubleshooting)

---

## 🏗️ Architecture Overview

### System Components

| Service | Language | Framework | Port | Role |
|---------|----------|-----------|------|------|
| **SMS Sender** | Java | Spring Boot 4.0.0 | 8081 | Gateway service that handles SMS requests, checks block list, mocks 3rd party API, and publishes events to Kafka |
| **SMS Store** | Go | net/http | 8082 | Consumer service that receives Kafka events and stores messages in MongoDB |

### Infrastructure

- **Redis** (Port 6379): Block list storage
- **Kafka** (Port 9092): Event streaming between services
- **MongoDB** (Port 27017): Persistent message storage

### Data Flow

```
Client → Java Service → Redis (Block Check) → Mock 3P API → Kafka → Go Service → MongoDB
```

1. Client sends SMS request to Java service
2. Java validates request and checks Redis block list
3. If not blocked, Java mocks 3rd party SMS API call
4. Java publishes SMS event to Kafka
5. Go service consumes event from Kafka
6. Go service saves message to MongoDB
7. Java returns response to client

---

## 📦 Prerequisites

- **Docker** and **Docker Compose** (for infrastructure)
- **Java 21** (for SMS Sender service)
- **Go 1.24+** (for SMS Store service)
- **Maven** (for Java project)
- **Postman** or **curl** (for API testing)

---

## 🚀 Quick Start

### Step 1: Start Infrastructure

Start MongoDB, Redis, and Kafka using Docker Compose:

```bash
docker-compose up -d
```

Verify services are running:

```bash
docker ps
```

You should see containers for:
- `mongo` (port 27017)
- `redis` (port 6379)
- `kafka` (port 9092)

### Step 2: Start Java Service (SMS Sender)

```bash
cd sms-sender
./mvnw spring-boot:run
```

The service will start on **http://localhost:8081**

### Step 3: Start Go Service (SMS Store)

```bash
cd sms-store
go run cmd/server/main.go
```

The service will start on **http://localhost:8082**

### Step 4: Verify Services

**Java Service Health:**
```bash
curl http://localhost:8081/v1/block/test
```

**Go Service Health:**
```bash
curl http://localhost:8082/ping
```

Both should return successful responses.

---

## 📚 API Documentation

### SMS Sender Service (Java) - Port 8081

#### 1. Send SMS

**Endpoint:** `POST /v1/sms/send`

**Description:** Sends an SMS message. Checks block list, mocks 3rd party API, and publishes event to Kafka.

**Request Body:**
```json
{
  "phoneNumber": "1234567890",
  "message": "Hello World"
}
```

**Request Validation:**
- `phoneNumber`: Must be exactly 10 digits
- `message`: Must not be blank

**Response (200 OK):**
```json
{
  "requestId": "3080fe71-7355-4b5f-83c2-d0a693b2425c",
  "status": "SUCCESS",
  "timestamp": 1768457386276
}
```

**Response (403 Forbidden - User Blocked):**
```json
{
  "code": "USER_BLOCKED",
  "message": "User is blocked: 1234567890",
  "details": {},
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Response (400 Bad Request - Validation Error):**
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

**cURL Example:**
```bash
curl -X POST http://localhost:8081/v1/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890","message":"Hello World"}'
```

#### 2. Block User

**Endpoint:** `POST /v1/block/{userId}`

**Description:** Blocks a user from sending SMS.

**Path Parameter:**
- `userId`: User ID to block (typically phone number)

**Response (200 OK):**
```json
{
  "userId": "1234567890",
  "status": "blocked"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:8081/v1/block/1234567890
```

#### 3. Unblock User

**Endpoint:** `DELETE /v1/block/{userId}`

**Description:** Unblocks a user, allowing them to send SMS.

**Path Parameter:**
- `userId`: User ID to unblock

**Response (200 OK):**
```json
{
  "userId": "1234567890",
  "status": "unblocked"
}
```

**cURL Example:**
```bash
curl -X DELETE http://localhost:8081/v1/block/1234567890
```

#### 4. Check Block Status

**Endpoint:** `GET /v1/block/{userId}`

**Description:** Checks if a user is blocked.

**Path Parameter:**
- `userId`: User ID to check

**Response (200 OK - Blocked):**
```json
{
  "userId": "1234567890",
  "isBlocked": true
}
```

**Response (200 OK - Not Blocked):**
```json
{
  "userId": "1234567890",
  "isBlocked": false
}
```

**cURL Example:**
```bash
curl http://localhost:8081/v1/block/1234567890
```

---

### SMS Store Service (Go) - Port 8082

#### 1. Get User Messages

**Endpoint:** `GET /v1/user/{user_id}/messages`

**Description:** Retrieves all SMS messages for a specific user.

**Path Parameter:**
- `user_id`: User ID (typically phone number)

**Response (200 OK):**
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

**Response (200 OK - No Messages):**
```json
[]
```

**cURL Example:**
```bash
curl http://localhost:8082/v1/user/1234567890/messages
```

#### 2. Health Check

**Endpoint:** `GET /ping`

**Description:** Health check endpoint.

**Response (200 OK):**
```json
{
  "status": "UP"
}
```

**cURL Example:**
```bash
curl http://localhost:8082/ping
```

#### 3. Delete All Messages (Testing Only)

**Endpoint:** `DELETE /messages`

**Description:** Deletes all messages from MongoDB. **Use only for testing.**

**Response (200 OK):**
```json
{
  "message": "All messages deleted successfully",
  "deletedCount": 5
}
```

**cURL Example:**
```bash
curl -X DELETE http://localhost:8082/messages
```

#### 4. List All Messages (Testing Only)

**Endpoint:** `GET /messages`

**Description:** Lists all messages in the database. **Use only for testing.**

**Response (200 OK):**
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

**cURL Example:**
```bash
curl http://localhost:8082/messages
```

---

## ⚙️ Configuration

### Java Service Configuration

**File:** `sms-sender/src/main/resources/application.yml`

```yaml
server:
  port: 8081

spring:
  data:
    redis:
      host: localhost
      port: 6379
      timeout: 2000ms
      lettuce:
        pool:
          max-active: 8
          max-idle: 8
          min-idle: 0
  kafka:
    bootstrap-servers: localhost:9092
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
      properties:
        spring.json.add.type.headers: false
```

### Go Service Configuration

**Environment Variables:**
- `MONGODB_URI`: MongoDB connection string (default: `mongodb://localhost:27017`)
- `MONGODB_DATABASE`: Database name (default: `sms_store`)
- `MONGODB_COLLECTION`: Collection name (default: `messages`)
- `KAFKA_BROKERS`: Kafka broker addresses (default: `localhost:9092`)
- `KAFKA_GROUP_ID`: Consumer group ID (default: `sms-store-consumer-group`)
- `KAFKA_TOPIC`: Kafka topic name (default: `sms-events`)

**Example:**
```bash
export MONGODB_URI="mongodb://localhost:27017"
export MONGODB_DATABASE="sms_store"
export KAFKA_BROKERS="localhost:9092"
go run cmd/server/main.go
```

### Kafka Configuration

**Topic:** `sms-events`

The topic is automatically created when the first message is published. No manual topic creation is required.

---

## 🧪 Testing Guide

### Manual Testing with Postman

See [MANUAL_TESTING_GUIDE.md](./MANUAL_TESTING_GUIDE.md) for detailed Postman testing instructions.

### Automated Testing

Run the end-to-end test script:

```bash
chmod +x test-e2e.sh
./test-e2e.sh
```

This script will:
1. Clear all existing messages
2. Test blocked user scenario
3. Test successful SMS sending
4. Verify message storage
5. Test message retrieval

---

## 🔧 Troubleshooting

### Common Issues

#### 1. Services Won't Start

**Problem:** Java or Go service fails to start.

**Solutions:**
- Check if infrastructure is running: `docker ps`
- Verify ports are not in use: `lsof -i :8081` or `lsof -i :8082`
- Check service logs for errors

#### 2. Kafka Connection Issues

**Problem:** Java service can't connect to Kafka.

**Solutions:**
- Verify Kafka is running: `docker ps | grep kafka`
- Check Kafka logs: `docker logs kafka`
- Verify `spring.kafka.bootstrap-servers` in `application.yml`

#### 3. Redis Connection Issues

**Problem:** Block list operations fail.

**Solutions:**
- Verify Redis is running: `docker ps | grep redis`
- Test Redis connection: `redis-cli ping` (should return `PONG`)
- Check Redis host/port in `application.yml`

#### 4. MongoDB Connection Issues

**Problem:** Go service can't connect to MongoDB.

**Solutions:**
- Verify MongoDB is running: `docker ps | grep mongo`
- Check MongoDB connection string
- Verify MongoDB is accessible: `mongosh mongodb://localhost:27017`

#### 5. Messages Not Appearing in MongoDB

**Problem:** SMS sent but not stored.

**Solutions:**
- Check Go service logs for Kafka consumer errors
- Verify Kafka topic exists: `kafka-topics --list --bootstrap-server localhost:9092`
- Check if Kafka consumer is running (should see "Kafka consumer started successfully" in logs)
- Wait 3-5 seconds after sending SMS for Kafka processing

#### 6. Status Shows "FIL" Instead of "FAIL"

**Problem:** Response status is truncated.

**Solution:** This is likely a display issue in your API client. Check the raw JSON response - it should show "SUCCESS" or "FAIL" correctly.

---

## 📝 Project Structure

```
SMS-System/
├── sms-sender/              # Java Spring Boot service
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/
│   │   │   │   └── com/meesho/sms_sender/
│   │   │   │       ├── config/        # Kafka configuration
│   │   │   │       ├── controller/    # REST controllers
│   │   │   │       ├── dto/           # Data transfer objects
│   │   │   │       ├── exception/     # Exception handlers
│   │   │   │       └── service/       # Business logic
│   │   │   └── resources/
│   │   │       └── application.yml    # Configuration
│   │   └── test/                      # Unit tests
│   └── pom.xml
├── sms-store/                # Go service
│   ├── cmd/
│   │   └── server/
│   │       └── main.go       # Application entry point
│   ├── internal/
│   │   ├── httpapi/          # HTTP handlers
│   │   ├── kafka/            # Kafka consumer
│   │   ├── models/           # Data models
│   │   └── store/            # Storage interface and implementations
│   └── go.mod
├── compose.yml               # Docker Compose configuration
├── README.md                 # This file
├── MANUAL_TESTING_GUIDE.md   # Detailed testing instructions
├── test-e2e.sh              # End-to-end test script
└── REQUIREMENTS_COMPLIANCE_ANALYSIS.md
```

---

## 🎯 Key Features

- ✅ **Block List Management**: Redis-based user blocking
- ✅ **Event-Driven Architecture**: Kafka for inter-service communication
- ✅ **Mock 3rd Party API**: Simulates SMS vendor API with random SUCCESS/FAIL
- ✅ **Comprehensive Error Handling**: Proper HTTP status codes and error messages
- ✅ **Request Validation**: Jakarta validation for input validation
- ✅ **Unit Tests**: Comprehensive test coverage for business logic
- ✅ **MongoDB Persistence**: Reliable message storage
- ✅ **Health Checks**: Service health monitoring endpoints

---

## 📄 License

This project is part of a learning exercise.

---

## 👥 Contributors

Developed as part of the SMS System implementation.

---

**Last Updated:** January 2024
