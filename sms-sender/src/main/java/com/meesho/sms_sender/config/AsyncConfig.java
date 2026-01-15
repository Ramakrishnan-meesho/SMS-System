package com.meesho.sms_sender.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Configuration for async processing with dedicated thread pools.
 * Provides separate thread pools for different async operations.
 */
@Configuration
@EnableAsync
public class AsyncConfig {

    @Value("${sms.async.third-party-api.core-pool-size:5}")
    private int thirdPartyApiCorePoolSize;

    @Value("${sms.async.third-party-api.max-pool-size:10}")
    private int thirdPartyApiMaxPoolSize;

    @Value("${sms.async.third-party-api.queue-capacity:100}")
    private int thirdPartyApiQueueCapacity;

    @Value("${sms.async.third-party-api.keep-alive-seconds:60}")
    private int thirdPartyApiKeepAliveSeconds;

    /**
     * Thread pool executor for third-party API calls.
     * This executor is used for making async calls to external SMS providers.
     * 
     * @return Executor for third-party API operations
     */
    @Bean(name = "thirdPartyApiExecutor")
    public Executor thirdPartyApiExecutor() {
        ThreadPoolExecutor executor = new ThreadPoolExecutor(
            thirdPartyApiCorePoolSize,
            thirdPartyApiMaxPoolSize,
            thirdPartyApiKeepAliveSeconds,
            TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(thirdPartyApiQueueCapacity),
            r -> {
                Thread thread = new Thread(r, "third-party-api-" + System.currentTimeMillis());
                thread.setDaemon(false);
                return thread;
            },
            new ThreadPoolExecutor.CallerRunsPolicy() // Fallback to caller thread if queue is full
        );
        
        // Allow core threads to timeout
        executor.allowCoreThreadTimeOut(false);
        
        return executor;
    }
}
