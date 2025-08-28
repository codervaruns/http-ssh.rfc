import React, { useState, useEffect, useRef } from 'react';
import WebSocketService from './services/WebSocketService';
import './App.css';

function App() {
  // Generate a valid UUID for the room
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const [command, setCommand] = useState('');
  const [output, setOutput] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionUrl, setConnectionUrl] = useState(`ws://localhost:8080/ws/${generateUUID()}`); // Added room ID
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef(null);
  const outputRef = useRef(null);
  const idCounterRef = useRef(0); // Use ref to persist across renders

  const generateId = () => {
    idCounterRef.current += 1;
    return `${Date.now()}-${idCounterRef.current}`;
  };

  const addSystemMessage = (message) => {
    const systemOutput = {
      id: generateId(),
      command: '',
      stdout: message,
      stderr: '',
      exitCode: 0,
      timestamp: new Date().toLocaleTimeString(),
      isSystem: true
    };
    setOutput(prev => [...prev, systemOutput]);
  };

  useEffect(() => {
    // Set up WebSocket message handler
    const handleMessage = (message) => {
      console.log('Received message:', message);
      
      if (message.type === 'command_output') {
        const newOutput = {
          id: generateId(),
          command: message.payload.command,
          stdout: message.payload.stdout || '',
          stderr: message.payload.stderr || '',
          exitCode: message.payload.exitCode || 0,
          timestamp: new Date().toLocaleTimeString()
        };
        
        setOutput(prev => [...prev, newOutput]);
      } else if (message.type === 'stdout' || message.type === 'stderr') {
        // Handle streaming output chunks
        const streamOutput = {
          id: generateId(),
          command: '',
          stdout: message.type === 'stdout' ? (message.data || message.payload?.data || '') : '',
          stderr: message.type === 'stderr' ? (message.data || message.payload?.data || '') : '',
          exitCode: 0,
          timestamp: new Date().toLocaleTimeString(),
          isStream: true
        };
        
        setOutput(prev => [...prev, streamOutput]);
      } else if (message.type === 'command_start') {
        // Handle command start notification
        const commandStart = {
          id: generateId(),
          command: message.payload?.command || message.command || '',
          stdout: '',
          stderr: '',
          exitCode: 0,
          timestamp: new Date().toLocaleTimeString(),
          isCommand: true
        };
        
        setOutput(prev => [...prev, commandStart]);
      } else if (message.type === 'command_end') {
        // Handle command completion
        const exitCode = message.payload?.exitCode || message.exitCode || 0;
        if (exitCode !== 0) {
          const errorOutput = {
            id: generateId(),
            command: '',
            stdout: '',
            stderr: `Command exited with code ${exitCode}`,
            exitCode: exitCode,
            timestamp: new Date().toLocaleTimeString(),
            isSystem: true
          };
          
          setOutput(prev => [...prev, errorOutput]);
        }
      }
    };

    // Set up connection status handler
    const handleConnection = (event) => {
      console.log('Connection event:', event);
      setIsConnected(event.type === 'connected');
      setIsConnecting(event.type === 'reconnecting');
      
      if (event.type === 'connected') {
        addSystemMessage(`✓ Connected to server: ${event.url}`);
      } else if (event.type === 'disconnected') {
        if (event.code === 1000 && event.wasImmediateDisconnect) {
          addSystemMessage(`✗ Server closed connection immediately after connecting. This may indicate:`);
          addSystemMessage(`  • Server doesn't support WebSocket connections on this endpoint`);
          addSystemMessage(`  • Server is configured to reject client connections`);
          addSystemMessage(`  • Authentication or protocol mismatch`);
          addSystemMessage(`  • Server-side error occurred during connection setup`);
          addSystemMessage(`  • Check server logs and ensure the correct WebSocket endpoint`);
        } else if (event.code === 1000) {
          const durationMsg = event.duration ? ` (connected for ${Math.round(event.duration/1000)}s)` : '';
          addSystemMessage(`✓ Disconnected from server${durationMsg}`);
        } else {
          const durationMsg = event.duration ? ` after ${Math.round(event.duration/1000)}s` : '';
          addSystemMessage(`✗ Connection lost${durationMsg}: ${event.reason} (code: ${event.code})`);
        }
      } else if (event.type === 'error') {
        const errorMsg = event.error?.message || 'Unknown connection error';
        addSystemMessage(`✗ Connection error: ${errorMsg}`);
      } else if (event.type === 'reconnecting') {
        addSystemMessage(`⟳ Reconnecting... (attempt ${event.attempt}/${event.maxAttempts})`);
      } else if (event.type === 'reconnect_failed') {
        addSystemMessage(`✗ Failed to reconnect after ${event.attempts} attempts. Please check server status and click Connect to try again.`);
      }
    };

    WebSocketService.addMessageHandler(handleMessage);
    WebSocketService.addConnectionHandler(handleConnection);

    // Cleanup on unmount
    return () => {
      WebSocketService.removeMessageHandler(handleMessage);
      WebSocketService.removeConnectionHandler(handleConnection);
      WebSocketService.disconnect();
    };
  }, []); // Remove idCounter dependency

  // Auto-scroll output to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!command.trim()) return;
    
    if (isConnected) {
      // Send command via WebSocket
      const success = WebSocketService.sendCommand(command.trim());
      
      if (success) {
        // Add command to history
        setCommandHistory(prev => [...prev, command.trim()]);
        setHistoryIndex(-1);
        
        // Add command echo to output
        const commandEcho = {
          id: generateId(),
          command: command.trim(),
          stdout: '',
          stderr: '',
          exitCode: 0,
          timestamp: new Date().toLocaleTimeString(),
          isCommand: true
        };
        setOutput(prev => [...prev, commandEcho]);
      } else {
        addSystemMessage('Failed to send command');
      }
    } else {
      addSystemMessage('Not connected to server');
    }
    
    setCommand('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setCommand(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setCommand('');
        } else {
          setHistoryIndex(newIndex);
          setCommand(commandHistory[newIndex]);
        }
      }
    }
  };

  const handleConnect = () => {
    if (isConnected) {
      WebSocketService.disconnect();
    } else {
      WebSocketService.resetReconnection();
      WebSocketService.connect(connectionUrl);
    }
  };

  const clearOutput = () => {
    setOutput([]);
  };

  return (
    <div className="terminal">
      <div className="terminal-header">
        <div className="terminal-title">HTTP-SSH Terminal</div>
        <div className="terminal-controls">
          <input
            type="text"
            value={connectionUrl}
            onChange={(e) => setConnectionUrl(e.target.value)}
            placeholder="WebSocket URL"
            className="url-input"
            disabled={isConnected || isConnecting}
          />
          <button 
            onClick={clearOutput}
            className="control-button"
            title="Clear output"
          >
            Clear
          </button>
          <button 
            onClick={handleConnect}
            className={`control-button ${isConnected ? 'connected' : isConnecting ? 'connecting' : 'disconnected'}`}
            title={isConnected ? 'Disconnect' : isConnecting ? 'Connecting...' : 'Connect'}
            disabled={isConnecting}
          >
            {isConnected ? 'Disconnect' : isConnecting ? 'Connecting...' : 'Connect'}
          </button>
          <div className={`status-indicator ${isConnected ? 'connected' : isConnecting ? 'connecting' : 'disconnected'}`}>
            {isConnected ? '●' : isConnecting ? '○' : '●'}
          </div>
        </div>
      </div>

      <div className="terminal-output" ref={outputRef}>
        {output.map((item) => (
          <div key={item.id} className="output-item">
            {item.isCommand && (
              <div className="command-line">
                <span className="prompt">$ </span>
                <span className="command">{item.command}</span>
                <span className="timestamp">[{item.timestamp}]</span>
              </div>
            )}
            {item.stdout && (
              <div className={`stdout ${item.isSystem ? 'system' : ''}`}>
                {item.stdout}
              </div>
            )}
            {item.stderr && (
              <div className="stderr">
                {item.stderr}
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="terminal-input">
        <span className="prompt">$ </span>
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          className="command-input"
          placeholder="Enter command..."
          autoFocus
        />
      </form>
    </div>
  );
}
export default App;