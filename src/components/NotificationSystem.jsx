import React, { useEffect } from 'react';

const NotificationSystem = ({ notification, setNotification, autoClose = 5000 }) => {
  // Auto-close notification after specified time
  useEffect(() => {
    if (notification && autoClose > 0) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, autoClose);

      return () => clearTimeout(timer);
    }
  }, [notification, autoClose, setNotification]);

  if (!notification) return null;

  const getNotificationStyles = (type) => {
    switch (type) {
      case 'success':
        return 'bg-green-500 border-green-600';
      case 'error':
        return 'bg-red-500 border-red-600';
      case 'warning':
        return 'bg-orange-500 border-orange-600';
      case 'info':
        return 'bg-blue-500 border-blue-600';
      default:
        return 'bg-gray-500 border-gray-600';
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📢';
    }
  };

  return (
    <div className={`fixed top-4 right-4 p-4 rounded-lg text-white z-50 max-w-sm shadow-lg border-l-4 transform transition-all duration-300 ease-in-out ${
      getNotificationStyles(notification.type)
    }`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-xl">
          {getNotificationIcon(notification.type)}
        </div>
        
        <div className="flex-1">
          {notification.title && (
            <div className="font-semibold mb-1">{notification.title}</div>
          )}
          <div className="text-sm leading-relaxed">{notification.message}</div>
          
          {notification.action && (
            <button
              onClick={notification.action.onClick}
              className="mt-2 px-3 py-1 bg-white bg-opacity-20 hover:bg-opacity-30 rounded text-xs font-medium transition-colors"
            >
              {notification.action.label}
            </button>
          )}
        </div>
        
        <button
          onClick={() => setNotification(null)}
          className="flex-shrink-0 text-white hover:text-gray-200 transition-colors ml-2"
          title="Tancar notificació"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {/* Progress bar for auto-close */}
      {autoClose > 0 && (
        <div className="mt-3 w-full bg-white bg-opacity-20 rounded-full h-1">
          <div 
            className="bg-white h-1 rounded-full transition-all duration-300 ease-linear"
            style={{
              animation: `shrink ${autoClose}ms linear`,
              width: '100%'
            }}
          />
        </div>
      )}
      
      <style jsx>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
};

// Hook personalitzat per gestionar notificacions
export const useNotification = () => {
  const [notification, setNotification] = React.useState(null);

  const showNotification = (message, type = 'info', options = {}) => {
    const { title, action, autoClose = 5000 } = options;
    
    setNotification({
      message,
      type,
      title,
      action,
      autoClose,
      timestamp: Date.now()
    });
  };

  const showSuccess = (message, options = {}) => {
    showNotification(message, 'success', options);
  };

  const showError = (message, options = {}) => {
    showNotification(message, 'error', options);
  };

  const showWarning = (message, options = {}) => {
    showNotification(message, 'warning', options);
  };

  const showInfo = (message, options = {}) => {
    showNotification(message, 'info', options);
  };

  const clearNotification = () => {
    setNotification(null);
  };

  return {
    notification,
    setNotification,
    showNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    clearNotification
  };
};

export default NotificationSystem;
