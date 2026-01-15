#!/bin/bash

# End-to-End Test Script for SMS System
# This script tests the complete SMS sending flow

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Service URLs
JAVA_SERVICE="http://localhost:8081"
GO_SERVICE="http://localhost:8082"

# Test user
TEST_USER="1234567890"
TEST_MESSAGE="Hello from E2E test"

# Counters
PASSED=0
FAILED=0

# Helper functions
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
    ((PASSED++))
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
    ((FAILED++))
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

check_service() {
    local service=$1
    local url=$2
    local name=$3
    
    print_info "Checking $name..."
    if curl -s -f "$url" > /dev/null 2>&1; then
        print_success "$name is running"
        return 0
    else
        print_error "$name is not accessible at $url"
        return 1
    fi
}

wait_for_kafka() {
    print_info "Waiting 5 seconds for Kafka processing..."
    sleep 5
}

# Test functions
test_clear_messages() {
    print_header "Step 1: Clear All Messages"
    
    response=$(curl -s -X DELETE "$GO_SERVICE/messages")
    if echo "$response" | grep -q "deletedCount"; then
        deleted_count=$(echo "$response" | grep -o '"deletedCount":[0-9]*' | grep -o '[0-9]*')
        print_success "Cleared $deleted_count messages from database"
    else
        print_error "Failed to clear messages"
        return 1
    fi
}

test_block_user() {
    print_header "Step 2: Block User"
    
    response=$(curl -s -X POST "$JAVA_SERVICE/v1/block/$TEST_USER")
    if echo "$response" | grep -q "blocked"; then
        print_success "User $TEST_USER blocked successfully"
    else
        print_error "Failed to block user"
        echo "Response: $response"
        return 1
    fi
}

test_check_blocked() {
    print_header "Step 3: Verify User is Blocked"
    
    response=$(curl -s "$JAVA_SERVICE/v1/block/$TEST_USER")
    if echo "$response" | grep -q '"isBlocked":true'; then
        print_success "User is correctly blocked"
    else
        print_error "User block status check failed"
        echo "Response: $response"
        return 1
    fi
}

test_send_sms_blocked() {
    print_header "Step 4: Try to Send SMS to Blocked User (Should Fail)"
    
    response=$(curl -s -X POST "$JAVA_SERVICE/v1/sms/send" \
        -H "Content-Type: application/json" \
        -d "{\"phoneNumber\":\"$TEST_USER\",\"message\":\"$TEST_MESSAGE\"}")
    
    if echo "$response" | grep -q "USER_BLOCKED"; then
        print_success "SMS correctly rejected for blocked user (403 Forbidden)"
    else
        print_error "SMS was not rejected for blocked user"
        echo "Response: $response"
        return 1
    fi
}

test_unblock_user() {
    print_header "Step 5: Unblock User"
    
    response=$(curl -s -X DELETE "$JAVA_SERVICE/v1/block/$TEST_USER")
    if echo "$response" | grep -q "unblocked"; then
        print_success "User $TEST_USER unblocked successfully"
    else
        print_error "Failed to unblock user"
        echo "Response: $response"
        return 1
    fi
}

test_send_sms_success() {
    print_header "Step 6: Send SMS (Should Succeed)"
    
    response=$(curl -s -X POST "$JAVA_SERVICE/v1/sms/send" \
        -H "Content-Type: application/json" \
        -d "{\"phoneNumber\":\"$TEST_USER\",\"message\":\"$TEST_MESSAGE\"}")
    
    if echo "$response" | grep -q "requestId"; then
        request_id=$(echo "$response" | grep -o '"requestId":"[^"]*"' | cut -d'"' -f4)
        status=$(echo "$response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        print_success "SMS sent successfully (Request ID: $request_id, Status: $status)"
        echo "$request_id" > /tmp/sms_request_id.txt
        echo "$status" > /tmp/sms_status.txt
    else
        print_error "Failed to send SMS"
        echo "Response: $response"
        return 1
    fi
}

test_verify_message_stored() {
    print_header "Step 7: Verify Message Stored in MongoDB"
    
    wait_for_kafka
    
    response=$(curl -s "$GO_SERVICE/v1/user/$TEST_USER/messages")
    
    if echo "$response" | grep -q "$TEST_MESSAGE"; then
        message_count=$(echo "$response" | grep -o '"id"' | wc -l)
        print_success "Message found in database (Total messages: $message_count)"
        
        # Verify message fields
        if echo "$response" | grep -q '"phoneNumber"'; then
            print_success "Message has phoneNumber field"
        else
            print_error "Message missing phoneNumber field"
            return 1
        fi
        
        if echo "$response" | grep -q '"text"'; then
            print_success "Message has text field"
        else
            print_error "Message missing text field"
            return 1
        fi
        
        if echo "$response" | grep -q '"status"'; then
            print_success "Message has status field"
        else
            print_error "Message missing status field"
            return 1
        fi
        
        if echo "$response" | grep -q '"createdAt"'; then
            print_success "Message has createdAt field"
        else
            print_error "Message missing createdAt field"
            return 1
        fi
    else
        print_error "Message not found in database"
        echo "Response: $response"
        return 1
    fi
}

test_validation_errors() {
    print_header "Step 8: Test Validation Errors"
    
    # Test invalid phone number (too short)
    print_info "Testing invalid phone number (too short)..."
    response=$(curl -s -X POST "$JAVA_SERVICE/v1/sms/send" \
        -H "Content-Type: application/json" \
        -d '{"phoneNumber":"123","message":"Test"}')
    
    if echo "$response" | grep -q "VALIDATION_ERROR"; then
        print_success "Validation error correctly returned for invalid phone number"
    else
        print_error "Validation error not returned for invalid phone number"
        echo "Response: $response"
        return 1
    fi
    
    # Test empty message
    print_info "Testing empty message..."
    response=$(curl -s -X POST "$JAVA_SERVICE/v1/sms/send" \
        -H "Content-Type: application/json" \
        -d "{\"phoneNumber\":\"$TEST_USER\",\"message\":\"\"}")
    
    if echo "$response" | grep -q "VALIDATION_ERROR"; then
        print_success "Validation error correctly returned for empty message"
    else
        print_error "Validation error not returned for empty message"
        echo "Response: $response"
        return 1
    fi
}

test_multiple_messages() {
    print_header "Step 9: Test Multiple Messages"
    
    print_info "Sending 3 SMS messages..."
    
    for i in {1..3}; do
        response=$(curl -s -X POST "$JAVA_SERVICE/v1/sms/send" \
            -H "Content-Type: application/json" \
            -d "{\"phoneNumber\":\"$TEST_USER\",\"message\":\"Message $i\"}")
        
        if echo "$response" | grep -q "requestId"; then
            print_success "Message $i sent successfully"
        else
            print_error "Failed to send message $i"
            return 1
        fi
    done
    
    wait_for_kafka
    
    response=$(curl -s "$GO_SERVICE/v1/user/$TEST_USER/messages")
    message_count=$(echo "$response" | grep -o '"id"' | wc -l)
    
    if [ "$message_count" -ge 3 ]; then
        print_success "All messages stored correctly (Total: $message_count)"
    else
        print_error "Not all messages were stored (Expected: >=3, Got: $message_count)"
        return 1
    fi
}

# Main execution
main() {
    print_header "SMS System - End-to-End Test Suite"
    
    # Check services are running
    print_header "Checking Services"
    if ! check_service "$JAVA_SERVICE" "$JAVA_SERVICE/v1/block/test" "Java Service"; then
        print_error "Java service is not running. Please start it first."
        exit 1
    fi
    
    if ! check_service "$GO_SERVICE" "$GO_SERVICE/ping" "Go Service"; then
        print_error "Go service is not running. Please start it first."
        exit 1
    fi
    
    # Run tests
    test_clear_messages || exit 1
    test_block_user || exit 1
    test_check_blocked || exit 1
    test_send_sms_blocked || exit 1
    test_unblock_user || exit 1
    test_send_sms_success || exit 1
    test_verify_message_stored || exit 1
    test_validation_errors || exit 1
    test_multiple_messages || exit 1
    
    # Summary
    print_header "Test Summary"
    echo -e "${GREEN}Passed: $PASSED${NC}"
    echo -e "${RED}Failed: $FAILED${NC}"
    
    if [ $FAILED -eq 0 ]; then
        echo -e "\n${GREEN}All tests passed! ✓${NC}\n"
        exit 0
    else
        echo -e "\n${RED}Some tests failed! ✗${NC}\n"
        exit 1
    fi
}

# Run main function
main
