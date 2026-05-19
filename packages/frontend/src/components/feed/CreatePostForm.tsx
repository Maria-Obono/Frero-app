import { useState, useRef } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/shared/Toast';

interface CreatePostFormProps {
  onPostCreated?: () => void;
}

export function CreatePostForm({ onPostCreated }: CreatePostFormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [content, setContent] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<{ url: string; type: 'image' | 'video' }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [postMode, setPostMode] = useState<'post' | 'reel'>('post');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Limit to 10 files for posts
    const newFiles = [...selectedFiles, ...files].slice(0, 10);
    setSelectedFiles(newFiles);

    // Generate previews
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    const newPreviews = newFiles.map((file) => ({
      url: URL.createObjectURL(file),
      type: (file.type.startsWith('video/') ? 'video' : 'image') as 'image' | 'video',
    }));
    setPreviews(newPreviews);
    setPostMode('post');
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      addToast('Please select a video file', 'error');
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      addToast('Video must be under 100MB', 'error');
      return;
    }

    // Clear existing files and set video
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    setSelectedFiles([file]);
    setPreviews([{ url: URL.createObjectURL(file), type: 'video' }]);
    setPostMode('reel');
  };

  const removeFile = (index: number) => {
    URL.revokeObjectURL(previews[index]!.url);
    setSelectedFiles((f) => f.filter((_, i) => i !== index));
    setPreviews((p) => p.filter((_, i) => i !== index));
    if (selectedFiles.length <= 1) setPostMode('post');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim() && selectedFiles.length === 0) {
      addToast('Write something or add media', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (postMode === 'reel' && selectedFiles.length === 1 && selectedFiles[0]!.type.startsWith('video/')) {
        // Create a reel
        const formData = new FormData();
        formData.append('video', selectedFiles[0]!);
        formData.append('caption', content);
        formData.append('duration', '0'); // Duration could be extracted client-side

        await api.post('/reels', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        addToast('Reel posted!', 'success');
      } else {
        // Create a regular post
        const formData = new FormData();
        formData.append('content', content);

        if (selectedFiles.length > 0) {
          const hasVideo = selectedFiles.some((f) => f.type.startsWith('video/'));
          formData.append('type', hasVideo ? 'video' : 'photo');
          selectedFiles.forEach((file) => formData.append('media', file));
        } else {
          formData.append('type', 'text');
        }

        formData.append('privacy', 'public');

        await api.post('/posts', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        addToast('Post created!', 'success');
      }

      // Reset form
      setContent('');
      setSelectedFiles([]);
      previews.forEach((p) => URL.revokeObjectURL(p.url));
      setPreviews([]);
      setPostMode('post');

      onPostCreated?.();
    } catch {
      addToast(postMode === 'reel' ? 'Failed to post reel' : 'Failed to create post', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full overflow-hidden bg-primary-500 flex items-center justify-center text-white text-sm font-medium shrink-0">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span>{(user?.displayName || user?.username || 'U')[0]?.toUpperCase()}</span>
          )}
        </div>

        {/* Input area */}
        <div className="flex-1 min-w-0">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={postMode === 'reel' ? 'Add a caption for your reel...' : "What's on your mind?"}
            rows={2}
            maxLength={5000}
            className="w-full resize-none border-0 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-0 focus:outline-none text-sm"
          />

          {/* Media previews */}
          {previews.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {previews.map((preview, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-900">
                  {preview.type === 'video' ? (
                    <div className="w-full h-full flex items-center justify-center relative">
                      <video src={preview.url} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                      {postMode === 'reel' && (
                        <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-purple-500 text-white px-1 rounded font-medium">REEL</span>
                      )}
                    </div>
                  ) : (
                    <img src={preview.url} alt="" className="w-full h-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center text-white text-xs"
                    aria-label="Remove file"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                </svg>
                Photo
              </button>
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                Reel
              </button>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || (!content.trim() && selectedFiles.length === 0)}
              className="px-4 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Posting...' : postMode === 'reel' ? 'Post Reel' : 'Post'}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            aria-label="Select photos"
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            onChange={handleVideoSelect}
            className="hidden"
            aria-label="Select video for reel"
          />
        </div>
      </div>
    </form>
  );
}
