/**
 * Connection status indicator component.
 * Shows the current Socket.IO connection state and provides a manual reconnect button.
 * Requirements: 15.6 (manual reconnect option when attempts exhausted)
 */
import { useSocketContext } from '@/contexts/SocketContext';

export function ConnectionStatus() {
  const { connectionStatus, reconnect } = useSocketContext();

  if (connectionStatus === 'connected') {
    return null; // Don't show anything when connected
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg px-4 py-2 text-sm shadow-lg bg-gray-800 text-white dark:bg-gray-700"
    >
      {connectionStatus === 'connecting' && (
        <>
          <span className="inline-block h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
          <span>Reconnecting...</span>
        </>
      )}

      {connectionStatus === 'disconnected' && (
        <>
          <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
          <span>Disconnected</span>
        </>
      )}

      {connectionStatus === 'failed' && (
        <>
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          <span>Connection lost</span>
          <button
            onClick={reconnect}
            className="ml-2 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Reconnect
          </button>
        </>
      )}
    </div>
  );
}
