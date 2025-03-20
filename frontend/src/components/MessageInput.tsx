import { useState } from 'react';

interface MessageInputProps {
  onSubmit: (message: string) => Promise<void> | void;
  placeholder?: string;
  disabled?: boolean;
}

const MessageInput = ({ onSubmit, placeholder = "메시지를 입력하세요...", disabled = false }: MessageInputProps) => {
  const [messageText, setMessageText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!messageText.trim() || isSubmitting || disabled) return;
    
    setIsSubmitting(true);
    
    try {
      await onSubmit(messageText);
      setMessageText('');
    } catch (error) {
      console.error('메시지 전송 오류:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitOnEnter = (event: React.KeyboardEvent) => {
    // Enter 키를 누르고 Shift 키는 누르지 않았을 때 메시지 전송
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center p-2 border-t border-gray-200">
      <input
        className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        type="text"
        placeholder={placeholder}
        value={messageText}
        onChange={(e) => setMessageText(e.target.value)}
        onKeyDown={submitOnEnter}
        disabled={disabled || isSubmitting}
      />
      <button
        type="submit"
        className="ml-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        disabled={!messageText.trim() || isSubmitting || disabled}
      >
        전송
      </button>
    </form>
  );
};

export default MessageInput; 