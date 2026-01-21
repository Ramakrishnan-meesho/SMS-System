'use client';

import { useState, useEffect } from 'react';
import { X, User, Image as ImageIcon, Save, Loader2 } from 'lucide-react';
import { storeApiClient, Profile } from '@/lib/api';

interface ProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  phoneNumber: string;
  onProfileUpdated?: () => void;
}

export default function ProfileDialog({
  isOpen,
  onClose,
  phoneNumber,
  onProfileUpdated,
}: ProfileDialogProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Load profile when dialog opens
  useEffect(() => {
    if (isOpen && phoneNumber) {
      loadProfile();
    } else if (isOpen && !phoneNumber) {
      setError('Phone number is required');
    }
  }, [isOpen, phoneNumber]);

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await storeApiClient.getProfile(phoneNumber);
      setProfile(data);
      setName(data.name || '');
      setAvatar(data.avatar || '');
      setIsEditing(false);
    } catch (err: any) {
      // If profile doesn't exist, allow creating one
      if (err.message?.includes('not found')) {
        setProfile(null);
        setName('');
        setAvatar('');
        setIsEditing(true);
      } else {
        setError(err.message || 'Failed to load profile');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (profile) {
        // Update existing profile
        const updated = await storeApiClient.updateProfile(phoneNumber, {
          name: name.trim(),
          avatar: avatar.trim(),
        });
        setProfile(updated);
        setIsEditing(false);
        onProfileUpdated?.();
      } else {
        // Create new profile
        const created = await storeApiClient.createProfile({
          phoneNumber,
          name: name.trim(),
          avatar: avatar.trim(),
        });
        setProfile(created);
        setIsEditing(false);
        onProfileUpdated?.();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setName('');
    setAvatar('');
    setError(null);
    setIsEditing(false);
    onClose();
  };

  const handleCancel = () => {
    if (profile) {
      setName(profile.name || '');
      setAvatar(profile.avatar || '');
      setIsEditing(false);
    } else {
      setName('');
      setAvatar('');
    }
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h2 className="text-xl font-semibold text-gray-800">Profile</h2>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              <span className="ml-2 text-gray-600">Loading profile...</span>
            </div>
          ) : (
            <>
              {/* Phone Number Display */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
                  {phoneNumber}
                </div>
              </div>

              {/* Avatar Preview */}
              {avatar && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Avatar Preview
                  </label>
                  <div className="flex justify-center">
                    {avatar.startsWith('data:') || avatar.startsWith('http') ? (
                      <img
                        src={avatar}
                        alt="Avatar"
                        className="w-24 h-24 rounded-full object-cover border-2 border-gray-200"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Name Field */}
              <div className="mb-4">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setError(null);
                    }}
                    disabled={!isEditing}
                    placeholder="Enter your name"
                    className={`w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      !isEditing ? 'bg-gray-50 cursor-not-allowed' : ''
                    }`}
                  />
                </div>
              </div>

              {/* Avatar URL Field */}
              <div className="mb-4">
                <label htmlFor="avatar" className="block text-sm font-medium text-gray-700 mb-2">
                  Avatar URL
                </label>
                <div className="relative">
                  <ImageIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="avatar"
                    type="text"
                    value={avatar}
                    onChange={(e) => {
                      setAvatar(e.target.value);
                      setError(null);
                    }}
                    disabled={!isEditing}
                    placeholder="Enter avatar URL or base64 data"
                    className={`w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      !isEditing ? 'bg-gray-50 cursor-not-allowed' : ''
                    }`}
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Enter a URL (http/https) or base64 data URI for the avatar image
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Profile Metadata */}
              {profile && !isEditing && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">
                    Created: {new Date(profile.createdAt).toLocaleString()}
                  </p>
                  {profile.updatedAt && (
                    <p className="text-xs text-gray-500 mt-1">
                      Updated: {new Date(profile.updatedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 justify-end">
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={saving}
                      className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving || !name.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Save
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Edit Profile
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
