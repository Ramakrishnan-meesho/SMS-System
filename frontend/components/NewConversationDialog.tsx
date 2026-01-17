'use client';

import { useState, useEffect } from 'react';
import { X, Phone } from 'lucide-react';

interface NewConversationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onStartConversation: (phoneNumber: string) => void;
}

export default function NewConversationDialog({
  isOpen,
  onClose,
  onStartConversation,
}: NewConversationDialogProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPhoneNumber('');
      setError(null);
    }
  }, [isOpen]);

  const validatePhoneNumber = (phone: string): boolean => {
    // Basic validation: should be non-empty and contain only digits, spaces, hyphens, or plus
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    return cleaned.length >= 10 && /^\+?[\d]+$/.test(cleaned);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedPhone = phoneNumber.trim();
    
    if (!trimmedPhone) {
      setError('Phone number is required');
      return;
    }

    if (!validatePhoneNumber(trimmedPhone)) {
      setError('Please enter a valid phone number (at least 10 digits)');
      return;
    }

    // Normalize phone number (remove spaces, hyphens, etc.)
    const normalizedPhone = trimmedPhone.replace(/[\s\-\(\)]/g, '');
    
    onStartConversation(normalizedPhone);
    onClose();
  };

  const handleClose = () => {
    setPhoneNumber('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold text-gray-800">New Conversation</h2>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-4">
            <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-2">
              Phone Number
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="phoneNumber"
                type="tel"
                value={phoneNumber}
                onChange={(e) => {
                  setPhoneNumber(e.target.value);
                  setError(null);
                }}
                placeholder="Enter phone number (e.g., +1234567890)"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
            </div>
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
            <p className="mt-2 text-xs text-gray-500">
              Enter the phone number to start a new conversation
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Start Conversation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
