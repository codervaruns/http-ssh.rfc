import React, { useState, useEffect, useRef, useCallback } from 'react';
import WebSocketService from './services/WebSocketService';
import AutoCompleteService from './services/AutoCompleteService';
import FileExplorer from './components/FileExplorer';
import AutoComplete from './components/AutoComplete';
import './App.css';

function App() {
  // Generate a valid UUID for the room
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : ((r & 0x3) | 0x8);
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
  const [currentDirectory, setCurrentDirectory] = useState('/');
  const [showFileExplorer, setShowFileExplorer] = useState(true);
  const [lastCommandOutput, setLastCommandOutput] = useState(null);
  
  // Auto-completion state variables
  const [autoCompleteVisible, setAutoCompleteVisible] = useState(false);
  const [autoCompleteSuggestions, setAutoCompleteSuggestions] = useState([]);
  const [autoCompleteSelectedIndex, setAutoCompleteSelectedIndex] = useState(0);
  const [autoCompletePosition, setAutoCompletePosition] = useState({ left: 0, bottom: 0 });
  
  const inputRef = useRef(null);
  const outputRef = useRef(null);
  const idCounterRef = useRef(0); // Use ref to persist across renders

  const generateId = () => {
    idCounterRef.current += 1;
    return `${Date.now()}-${idCounterRef.current}`;
  };

  const addSystemMessage = useCallback((message) => {
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
  }, []);

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
        
        console.log('Command output received:', {
          command: newOutput.command,
          stdoutLength: newOutput.stdout.length,
          stderrLength: newOutput.stderr.length,
          exitCode: newOutput.exitCode
        });
        
        setOutput(prev => [...prev, newOutput]);
        setLastCommandOutput(newOutput);
        
        // Handle directory listing for auto-completion
        const autoCompleteResult = AutoCompleteService.handleCommandOutput(
          newOutput.command, 
          newOutput.stdout, 
          newOutput.stderr
        );
        
        if (autoCompleteResult && autoCompleteResult.type === 'directory_listing') {
          console.log('Directory contents cached for path:', autoCompleteResult.path);
        }
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
        // Also update lastCommandOutput for streaming data
        setLastCommandOutput(prev => {
          if (!prev) return streamOutput;
          return {
            ...prev,
            stdout: prev.stdout + streamOutput.stdout,
            stderr: prev.stderr + streamOutput.stderr
          };
        });
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
        
        if (event.isCircuitBreakerOpen) {
          addSystemMessage(`⊘ Connection attempts suspended: ${errorMsg}`);
          addSystemMessage(`  • Too many recent failures detected`);
          addSystemMessage(`  • Will retry automatically when conditions improve`);
        } else if (event.isFirewallIssue) {
          addSystemMessage(`✗ Firewall/Network Issue: ${errorMsg}`);
          addSystemMessage(`  • Multiple connection patterns suggest firewall blocking`);
          addSystemMessage(`  • Try connecting from a different network`);
          addSystemMessage(`  • Contact network administrator if on corporate network`);
        } else if (event.isHealthCheckFailure) {
          addSystemMessage(`✗ Server Health Check Failed: ${errorMsg}`);
          addSystemMessage(`  • Server may be down or restarting`);
          addSystemMessage(`  • Check server logs for errors`);
          addSystemMessage(`  • Verify server is running on correct port`);
        } else {
          addSystemMessage(`✗ Connection error: ${errorMsg}`);
        }
      } else if (event.type === 'reconnecting') {
        const strategyMsg = event.firewallDetected ? ' (firewall detected, using aggressive retry)' : '';
        addSystemMessage(`⟳ Reconnecting... (attempt ${event.attempt}/${event.maxAttempts})${strategyMsg}`);
      } else if (event.type === 'reconnect_delayed') {
        if (event.reason === 'circuit_breaker_open') {
          addSystemMessage(`⏸ Reconnection paused for ${event.retryAfter}s (circuit breaker active)`);
        }
      } else if (event.type === 'reconnect_failed') {
        if (event.reason === 'max_consecutive_failures') {
          addSystemMessage(`✗ Failed to reconnect after ${event.consecutiveFailures} consecutive failures.`);
          addSystemMessage(`  • Server may be permanently unavailable`);
          addSystemMessage(`  • Check server status and network connectivity`);
          addSystemMessage(`  • Click Connect to retry manually`);
        } else {
          addSystemMessage(`✗ Failed to reconnect after ${event.attempts} attempts. Please check server status and click Connect to try again.`);
        }
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
  }, [addSystemMessage]); // Remove idCounter dependency

  // Auto-scroll output to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // Update AutoCompleteService with current directory
  useEffect(() => {
    AutoCompleteService.setCurrentDirectory(currentDirectory);
  }, [currentDirectory]);

  // Update directory contents in AutoCompleteService when file explorer loads directory
  const handleDirectoryContentsLoaded = useCallback((path, contents) => {
    AutoCompleteService.cacheDirectoryContents(path, contents);
  }, []);

  const handleDirectoryChange = useCallback((newPath) => {
    setCurrentDirectory(newPath);
    AutoCompleteService.setCurrentDirectory(newPath);
  }, []);

  // Send command to server with deduplication
  const lastSentCommandRef = useRef('');
  const lastSentTimeRef = useRef(0);
  
  const sendCommand = useCallback((cmd) => {
    if (isConnected) {
      const now = Date.now();
      const timeSinceLastCommand = now - lastSentTimeRef.current;
      
      // Prevent duplicate commands sent within 500ms
      if (cmd === lastSentCommandRef.current && timeSinceLastCommand < 500) {
        console.log('Ignoring duplicate command:', cmd);
        return true;
      }
      
      lastSentCommandRef.current = cmd;
      lastSentTimeRef.current = now;
      
      // Add command to AutoCompleteService history
      AutoCompleteService.addToHistory(cmd.trim());
      
      // Send command via WebSocket
      const success = WebSocketService.sendCommand(cmd.trim());
      
      if (success) {
        // Add command to history
        setCommandHistory(prev => [...prev, cmd.trim()]);
        setHistoryIndex(-1);
        
        // Add command echo to output
        const commandEcho = {
          id: generateId(),
          command: cmd.trim(),
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
      
      return success;
    } else {
      addSystemMessage('Not connected to server');
      return false;
    }
  }, [isConnected, addSystemMessage]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!command.trim()) return;
    
    sendCommand(command);
    
    setCommand('');
    setAutoCompleteVisible(false);
  };

  const updateAutoComplete = (inputValue, cursorPosition, forceShow = false) => {
    if (!forceShow) {
      setAutoCompleteVisible(false);
      return;
    }

    if (!inputValue.trim()) {
      setAutoCompleteVisible(false);
      return;
    }

    const completions = AutoCompleteService.getCompletions(inputValue, cursorPosition);
    
    if (completions.suggestions.length > 0) {
      setAutoCompleteSuggestions(completions.suggestions);
      setAutoCompleteSelectedIndex(0);
      setAutoCompleteVisible(true);
      
      // Calculate position for dropdown
      if (inputRef.current) {
        const inputRect = inputRef.current.getBoundingClientRect();
        const charWidth = 8; // Approximate character width in monospace font
        const leftOffset = completions.startIndex * charWidth;
        
        setAutoCompletePosition({
          left: inputRect.left + leftOffset,
          bottom: window.innerHeight - inputRect.top + 5
        });
      }
    } else {
      setAutoCompleteVisible(false);
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setCommand(value);
    // Don't automatically trigger autocomplete on input change
  };

  const handleKeyDown = (e) => {
    // Hide autocomplete on spacebar (but not Ctrl+Space)
    if (e.key === ' ' && !e.ctrlKey && autoCompleteVisible) {
      setAutoCompleteVisible(false);
    }

    // Handle auto-completion navigation
    if (autoCompleteVisible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAutoCompleteSelectedIndex(prev => 
          prev < autoCompleteSuggestions.length - 1 ? prev + 1 : 0
        );
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAutoCompleteSelectedIndex(prev => 
          prev > 0 ? prev - 1 : autoCompleteSuggestions.length - 1
        );
        return;
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        if (e.key === 'Tab') {
          e.preventDefault();
          applyAutoComplete();
          return;
        } else if (e.key === 'Enter' && autoCompleteSelectedIndex >= 0) {
          e.preventDefault();
          applyAutoComplete();
          return;
        }
      } else if (e.key === 'Escape') {
        setAutoCompleteVisible(false);
        return;
      }
    }

    // Original key handling for command history
    if (e.key === 'ArrowUp' && !autoCompleteVisible) {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setCommand(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown' && !autoCompleteVisible) {
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

    // Show auto-complete on Ctrl+Space
    if (e.ctrlKey && e.key === ' ') {
      e.preventDefault();
      updateAutoComplete(command, e.target.selectionStart, true);
    }
  };

  const applyAutoComplete = () => {
    if (autoCompleteSelectedIndex >= 0 && autoCompleteSelectedIndex < autoCompleteSuggestions.length) {
      const suggestion = autoCompleteSuggestions[autoCompleteSelectedIndex];
      const completions = AutoCompleteService.getCompletions(command, inputRef.current?.selectionStart);
      
      const newCommand = 
        command.slice(0, completions.startIndex) + 
        suggestion.text + 
        command.slice(completions.endIndex);
      
      setCommand(newCommand);
      setAutoCompleteVisible(false);
      
      // Set cursor position after the completed text
      setTimeout(() => {
        if (inputRef.current) {
          const newCursorPos = completions.startIndex + suggestion.text.length;
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
          inputRef.current.focus();
        }
      }, 0);
    }
  };

  const handleAutoCompleteSelect = (suggestion, index, shouldComplete = true) => {
    setAutoCompleteSelectedIndex(index);
    if (shouldComplete) {
      applyAutoComplete();
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

  const toggleFileExplorer = () => {
    setShowFileExplorer(!showFileExplorer);
  };

  return (
    <div className="terminal">
      <div className="terminal-header">
        <div className="terminal-title">HTTP-SSH Terminal</div>
        <div className="terminal-controls">
          <button 
            onClick={toggleFileExplorer}
            className="control-button"
            title={showFileExplorer ? 'Hide file explorer' : 'Show file explorer'}
          >
            {showFileExplorer ? '◀' : '▶'} Files
          </button>
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

      <div className="terminal-body">
        {showFileExplorer && (
          <FileExplorer 
            isConnected={isConnected}
            onSendCommand={sendCommand}
            onDirectoryChange={handleDirectoryChange}
            onDirectoryContentsLoaded={handleDirectoryContentsLoaded}
            commandOutput={lastCommandOutput}
          />
        )}
        
        <div className="terminal-main">
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
            <span className="current-dir">{currentDirectory}</span>
            <div className="input-container">
              <input
                ref={inputRef}
                type="text"
                value={command}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onBlur={() => setTimeout(() => setAutoCompleteVisible(false), 200)}
                className="command-input"
                placeholder="Enter command... (Ctrl+Space for suggestions)"
                autoFocus
              />
              <AutoComplete
                suggestions={autoCompleteSuggestions}
                selectedIndex={autoCompleteSelectedIndex}
                onSelect={handleAutoCompleteSelect}
                position={autoCompletePosition}
                visible={autoCompleteVisible}
              />
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
export default App;