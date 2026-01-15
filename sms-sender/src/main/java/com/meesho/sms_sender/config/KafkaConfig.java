package com.meesho.sms_sender.config;

import com.meesho.sms_sender.dto.SmsEvent;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;
import org.springframework.kafka.support.serializer.JsonSerializer;

import java.util.HashMap;
import java.util.Map;

/**
 * Kafka configuration for producer setup.
 * Configures KafkaTemplate to send SmsEvent objects to Kafka.
 * Optimized for scalability with compression, retry topics, and DLQ.
 */
@Configuration
public class KafkaConfig {

    @Value("${spring.kafka.bootstrap-servers}")
    private String bootstrapServers;

    // Topic names
    public static final String SMS_EVENTS_TOPIC = "sms-events";
    public static final String SMS_EVENTS_RETRY_TOPIC = "sms-events-retry";
    public static final String SMS_EVENTS_DLQ_TOPIC = "sms-events-dlq";

    @Bean
    public ProducerFactory<String, SmsEvent> producerFactory() {
        Map<String, Object> configProps = new HashMap<>();
        configProps.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        configProps.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        configProps.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, JsonSerializer.class);

        // Reliability settings
        configProps.put(ProducerConfig.ACKS_CONFIG, "all"); // Wait for all replicas
        configProps.put(ProducerConfig.RETRIES_CONFIG, 3); // Retry on failure
        configProps.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true); // Prevent duplicates

        // Compression for better throughput and reduced network usage
        configProps.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "gzip");

        // Batch settings for better throughput
        configProps.put(ProducerConfig.BATCH_SIZE_CONFIG, 16384); // 16KB batch size
        configProps.put(ProducerConfig.LINGER_MS_CONFIG, 10); // Wait up to 10ms to batch

        // Buffer memory for better throughput
        configProps.put(ProducerConfig.BUFFER_MEMORY_CONFIG, 33554432); // 32MB buffer

        // Request timeout
        configProps.put(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, 30000); // 30 seconds

        // Disable type headers to ensure compatibility with Go consumer
        // This prevents Spring from adding __TypeId__ header which Go consumer doesn't
        // expect
        configProps.put("spring.json.add.type.headers", false);

        return new DefaultKafkaProducerFactory<>(configProps);
    }

    @Bean
    public KafkaTemplate<String, SmsEvent> kafkaTemplate() {
        return new KafkaTemplate<>(producerFactory());
    }
}
