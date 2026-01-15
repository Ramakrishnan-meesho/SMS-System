#!/bin/bash

# Kafka Topic Setup Script
# This script creates Kafka topics with optimized configuration for scalability
# Topics: sms-events (6-12 partitions), sms-events-retry, sms-events-dlq

set -e

KAFKA_BROKER="${KAFKA_BROKER:-localhost:9092}"
PARTITIONS="${PARTITIONS:-9}"  # Default to 9 partitions (middle of 6-12 range)
REPLICATION_FACTOR="${REPLICATION_FACTOR:-1}"  # For single-node setup

echo "Setting up Kafka topics..."
echo "Kafka Broker: $KAFKA_BROKER"
echo "Partitions: $PARTITIONS"
echo "Replication Factor: $REPLICATION_FACTOR"
echo ""

# Function to create topic if it doesn't exist
create_topic() {
    local topic_name=$1
    local partitions=$2
    local replication=$3
    
    echo "Creating topic: $topic_name"
    
    # Check if topic exists
    if kafka-topics.sh --bootstrap-server "$KAFKA_BROKER" --list | grep -q "^${topic_name}$"; then
        echo "  Topic '$topic_name' already exists. Skipping creation."
        echo "  To recreate, delete it first: kafka-topics.sh --bootstrap-server $KAFKA_BROKER --delete --topic $topic_name"
    else
        kafka-topics.sh \
            --bootstrap-server "$KAFKA_BROKER" \
            --create \
            --topic "$topic_name" \
            --partitions "$partitions" \
            --replication-factor "$replication" \
            --config compression.type=gzip \
            --config min.insync.replicas=1 \
            --if-not-exists
        
        echo "  ✓ Topic '$topic_name' created successfully"
    fi
}

# Create main SMS events topic with 6-12 partitions
create_topic "sms-events" "$PARTITIONS" "$REPLICATION_FACTOR"

# Create retry topic (for failed message retries)
create_topic "sms-events-retry" "$PARTITIONS" "$REPLICATION_FACTOR"

# Create dead letter queue topic (for messages that fail after retries)
create_topic "sms-events-dlq" "$PARTITIONS" "$REPLICATION_FACTOR"

echo ""
echo "✓ All topics created successfully!"
echo ""
echo "To verify topics:"
echo "  kafka-topics.sh --bootstrap-server $KAFKA_BROKER --list"
echo ""
echo "To describe a topic:"
echo "  kafka-topics.sh --bootstrap-server $KAFKA_BROKER --describe --topic sms-events"
echo ""
echo "Note: If using Docker, you may need to run this inside the Kafka container:"
echo "  docker exec -it kafka bash -c 'kafka-topics.sh --bootstrap-server localhost:9092 --create --topic sms-events --partitions $PARTITIONS --replication-factor $REPLICATION_FACTOR'"
