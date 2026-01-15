# Setup Scripts

## setup-kafka-topics.sh

Creates Kafka topics with optimized configuration for scalability.

### Features:
- Creates `sms-events` topic with 6-12 partitions (configurable, default: 9)
- Creates `sms-events-retry` topic for failed message retries
- Creates `sms-events-dlq` topic for dead letter queue
- Configures compression (gzip) for better throughput
- Idempotent - safe to run multiple times

### Usage:

**Option 1: Using environment variables**
```bash
export KAFKA_BROKER=localhost:9092
export PARTITIONS=9
./scripts/setup-kafka-topics.sh
```

**Option 2: Direct execution (uses defaults)**
```bash
./scripts/setup-kafka-topics.sh
```

**Option 3: With Docker Kafka container**
```bash
# If Kafka is running in Docker
docker exec -it kafka bash -c 'kafka-topics.sh --bootstrap-server localhost:9092 --create --topic sms-events --partitions 9 --replication-factor 1 --config compression.type=gzip'
```

### Environment Variables:
- `KAFKA_BROKER`: Kafka broker address (default: `localhost:9092`)
- `PARTITIONS`: Number of partitions for topics (default: `9`, recommended: 6-12)
- `REPLICATION_FACTOR`: Replication factor (default: `1` for single-node setup)

### Prerequisites:
- Kafka must be running and accessible
- `kafka-topics.sh` must be in PATH (or use Docker exec)

### Verifying Topics:
```bash
# List all topics
kafka-topics.sh --bootstrap-server localhost:9092 --list

# Describe a topic
kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic sms-events
```
