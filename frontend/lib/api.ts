import axios from 'axios';

const SMS_API_BASE = process.env.NEXT_PUBLIC_SMS_API_URL || 'http://localhost:8081/v1';
const STORE_API_BASE = process.env.NEXT_PUBLIC_STORE_API_URL || 'http://localhost:8082';

const smsApi = axios.create({
  baseURL: SMS_API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

const storeApi = axios.create({
  baseURL: STORE_API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface SendSmsRequest {
  phoneNumber: string;
  message: string;
}

export interface SendSmsResponse {
  requestId: string;
  status: string;
  timestamp: number;
}

export interface Message {
  id: string;
  correlationId?: string;
  phoneNumber: string;
  text: string;
  status: string;
  createdAt: string;
}

export interface BlockStatus {
  userId?: string; // Backward compatibility
  phoneNumber?: string;
  isBlocked: boolean;
  status?: string;
  message?: string;
}

export interface Profile {
  phoneNumber: string;
  name: string;
  avatar: string;
  createdAt: string;
  updatedAt: string;
}

// SMS Sender API
export const smsApiClient = {
  sendSms: async (request: SendSmsRequest): Promise<SendSmsResponse> => {
    try {
      console.log('Sending SMS request to:', `${SMS_API_BASE}/sms/send`, request);
      const response = await smsApi.post<SendSmsResponse>('/sms/send', request);
      console.log('SMS sent successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('SMS send error details:', {
        message: error.message,
        code: error.code,
        response: error.response?.data,
        status: error.response?.status,
        config: {
          url: error.config?.url,
          baseURL: error.config?.baseURL,
          method: error.config?.method,
        },
      });
      
      // Handle network errors (connection refused, etc.)
      if (!error.response) {
        throw new Error(
          `Network Error: Unable to connect to SMS service at ${SMS_API_BASE}. ` +
          `Please ensure the Java service is running on port 8081.`
        );
      }
      
      // Handle HTTP errors
      const errorMessage = 
        error.response?.data?.message || 
        error.response?.data?.error || 
        error.message || 
        'Failed to send SMS';
      throw new Error(errorMessage);
    }
  },
  
  blockUser: async (phoneNumber: string): Promise<BlockStatus> => {
    try {
      const response = await smsApi.post<BlockStatus>(`/block/${phoneNumber}`);
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to block user';
      throw new Error(errorMessage);
    }
  },
  
  unblockUser: async (phoneNumber: string): Promise<BlockStatus> => {
    try {
      const response = await smsApi.delete<BlockStatus>(`/block/${phoneNumber}`);
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to unblock user';
      throw new Error(errorMessage);
    }
  },
  
  checkBlockStatus: async (phoneNumber: string): Promise<BlockStatus> => {
    try {
      const response = await smsApi.get<BlockStatus>(`/block/${phoneNumber}`);
      return response.data;
    } catch (error: any) {
      // If user doesn't exist, return not blocked
      if (error.response?.status === 404) {
        return { phoneNumber, isBlocked: false };
      }
      const errorMessage = error.response?.data?.message || error.message || 'Failed to check block status';
      throw new Error(errorMessage);
    }
  },
};

// SMS Store API
export const storeApiClient = {
  getUserMessages: async (phoneNumber: string): Promise<Message[]> => {
    try {
      console.log(`Fetching messages for phone number: ${phoneNumber}`);
      const response = await storeApi.get<Message[]>(`/v1/user/${phoneNumber}/messages`);
      console.log(`Received ${response.data?.length || 0} messages for ${phoneNumber}`, response.data);
      
      // Ensure we have an array and parse dates properly
      const messages = (response.data || []).map(msg => ({
        ...msg,
        createdAt: msg.createdAt || new Date().toISOString(),
      }));
      
      return messages;
    } catch (error: any) {
      // Network errors
      if (!error.response) {
        console.error(`Network error fetching messages for ${phoneNumber}:`, error.message);
        throw new Error(
          `Network Error: Unable to connect to SMS Store service at ${STORE_API_BASE}. ` +
          `Please ensure the Go service is running on port 8082.`
        );
      }
      
      // HTTP errors
      if (error.response?.status === 404 || error.response?.status === 400) {
        // Return empty array if no messages found (not an error)
        console.log(`No messages found for ${phoneNumber} (status: ${error.response.status})`);
        return [];
      }
      
      console.error(`Error fetching user messages for ${phoneNumber}:`, {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      
      // For other errors, return empty array to prevent UI breakage
      return [];
    }
  },
  
  getConversations: async (): Promise<string[]> => {
    try {
      console.log('Fetching conversations...');
      const response = await storeApi.get<string[]>('/v1/conversations');
      console.log(`Received ${response.data?.length || 0} conversations`, response.data);
      return response.data || [];
    } catch (error: any) {
      // Network errors
      if (!error.response) {
        console.error('Network error fetching conversations:', error.message);
        throw new Error(
          `Network Error: Unable to connect to SMS Store service at ${STORE_API_BASE}. ` +
          `Please ensure the Go service is running on port 8082.`
        );
      }
      
      console.error('Error fetching conversations:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      
      // Return empty array on error to prevent UI breakage
      return [];
    }
  },
  
  getAllMessages: async (): Promise<Message[]> => {
    try {
      console.log('Fetching all messages...');
      const response = await storeApi.get<Message[]>('/messages');
      console.log(`Received ${response.data?.length || 0} total messages`);
      
      // Ensure we have an array and parse dates properly
      const messages = (response.data || []).map(msg => ({
        ...msg,
        createdAt: msg.createdAt || new Date().toISOString(),
      }));
      
      return messages;
    } catch (error: any) {
      // If endpoint doesn't exist, return empty array
      if (error.response?.status === 404) {
        console.log('GET /messages endpoint not available, returning empty array');
        return [];
      }
      
      // Network errors
      if (!error.response) {
        console.error('Network error fetching all messages:', error.message);
        return [];
      }
      
      console.error('Error fetching all messages:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      
      return [];
    }
  },
  
  ping: async (): Promise<{ status: string }> => {
    try {
      const response = await storeApi.get<{ status: string }>('/ping');
      return response.data;
    } catch (error: any) {
      console.error('Error pinging store API:', error);
      throw error;
    }
  },
  
  getProfile: async (phoneNumber: string): Promise<Profile> => {
    try {
      const response = await storeApi.get<Profile>(`/v1/profile/${phoneNumber}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error('Profile not found');
      }
      const errorMessage = error.response?.data?.message || error.message || 'Failed to get profile';
      throw new Error(errorMessage);
    }
  },
  
  updateProfile: async (phoneNumber: string, profile: Partial<Profile>): Promise<Profile> => {
    try {
      const response = await storeApi.put<Profile>(`/v1/profile/${phoneNumber}`, profile);
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to update profile';
      throw new Error(errorMessage);
    }
  },
  
  createProfile: async (profile: Omit<Profile, 'createdAt' | 'updatedAt'>): Promise<Profile> => {
    try {
      const response = await storeApi.post<Profile>('/v1/profile', profile);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 409) {
        throw new Error('Profile already exists');
      }
      const errorMessage = error.response?.data?.message || error.message || 'Failed to create profile';
      throw new Error(errorMessage);
    }
  },
  
  deleteConversation: async (phoneNumber: string): Promise<{ message: string; deletedCount: number; phoneNumber: string }> => {
    try {
      console.log('Deleting conversation for phone number:', phoneNumber);
      const url = `/v1/user/${phoneNumber}/messages`;
      console.log('DELETE request to:', `${STORE_API_BASE}${url}`);
      const response = await storeApi.delete<{ message: string; deletedCount: number; phoneNumber: string }>(url);
      console.log('Delete conversation successful:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('Delete conversation error:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        url: error.config?.url,
        method: error.config?.method,
      });
      const errorMessage = error.response?.data?.message || error.message || 'Failed to delete conversation';
      throw new Error(errorMessage);
    }
  },
};
