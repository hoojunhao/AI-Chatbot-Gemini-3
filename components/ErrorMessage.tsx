import React from 'react';
import { ParsedGeminiError, ErrorRecoveryAction, GeminiErrorType } from '../types';
import { getRecoveryActions } from '../services/errorService';

interface ErrorMessageProps {
  error: ParsedGeminiError;
  onAction: (action: ErrorRecoveryAction['action']) => void;
}

// Icon mapping for each error type
const ERROR_ICONS: Record<GeminiErrorType, string> = {
  [GeminiErrorType.CONTEXT_OVERFLOW]: '📚',
  [GeminiErrorType.RATE_LIMITED]: '⏱️',
  [GeminiErrorType.INVALID_API_KEY]: '🔑',
  [GeminiErrorType.SAFETY_BLOCKED]: '🛡️',
  [GeminiErrorType.MODEL_UNAVAILABLE]: '🔧',
  [GeminiErrorType.NETWORK_ERROR]: '🌐',
  [GeminiErrorType.UNKNOWN]: '⚠️',
};

// Color schemes for each error type (with dark mode support)
const ERROR_COLORS: Record<GeminiErrorType, string> = {
  [GeminiErrorType.CONTEXT_OVERFLOW]: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800',
  [GeminiErrorType.RATE_LIMITED]: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
  [GeminiErrorType.INVALID_API_KEY]: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
  [GeminiErrorType.SAFETY_BLOCKED]: 'bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800',
  [GeminiErrorType.MODEL_UNAVAILABLE]: 'bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-700',
  [GeminiErrorType.NETWORK_ERROR]: 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800',
  [GeminiErrorType.UNKNOWN]: 'bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-700',
};

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ error, onAction }) => {
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  const actions = getRecoveryActions(error.type);
  const icon = ERROR_ICONS[error.type];
  const colorClass = ERROR_COLORS[error.type];

  return (
    <div className={`rounded-lg border p-4 shadow-lg ${colorClass}`}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-label="error-icon">{icon}</span>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            {error.userMessage}
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {error.suggestion}
          </p>
        </div>
      </div>

      {/* Actions */}
      {actions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={() => onAction(action.action)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                action.primary
                  ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Debug info (collapsible) */}
      <details
        className="mt-4"
        open={detailsOpen}
        onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none">
          Technical details
        </summary>
        <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-x-auto text-gray-800 dark:text-gray-200">
          {JSON.stringify({
            type: error.type,
            httpCode: error.httpCode,
            message: error.message,
            retryable: error.retryable,
          }, null, 2)}
        </pre>
      </details>
    </div>
  );
};
