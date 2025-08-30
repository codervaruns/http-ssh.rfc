import React, { useState, useEffect, useCallback, useRef } from 'react';
import './FileExplorer.css';

const FileExplorer = ({ isConnected, onSendCommand, onDirectoryChange, onDirectoryContentsLoaded, commandOutput }) => {
  const [currentPath, setCurrentPath] = useState('/');
  const [directoryItems, setDirectoryItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastListCommand, setLastListCommand] = useState('');
  
  // Use ref to track timeout and prevent memory leaks
  const timeoutRef = useRef(null);
  const pendingRequestRef = useRef(false);

  // Listen for command output that might be directory listings
  useEffect(() => {
    if (commandOutput && commandOutput.command && commandOutput.stdout) {
      const command = commandOutput.command.trim();
      
      // Check if this is a directory listing command we sent
      if (command === lastListCommand || 
          command.match(/^(?:ls|dir)\s+(?:-[la]+\s+)?/)) {
        
        try {
          const items = parseDirectoryOutput(commandOutput.stdout, currentPath);
          if (items.length > 0 || commandOutput.stdout.includes('total ')) {
            setDirectoryItems(items);
            setError('');
            
            // Notify parent about directory contents for auto-completion
            if (onDirectoryContentsLoaded) {
              onDirectoryContentsLoaded(currentPath, items);
            }
          }
        } catch (err) {
          console.error('Error parsing directory output:', err);
          setError('Failed to parse directory listing');
        }
        
        setLoading(false);
        setLastListCommand('');
        pendingRequestRef.current = false;
        
        // Clear timeout if response received
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    }
  }, [commandOutput, lastListCommand, currentPath, onDirectoryContentsLoaded]);

  const loadDirectory = useCallback((path) => {
    if (!isConnected || pendingRequestRef.current) return;
    
    setLoading(true);
    setError('');
    pendingRequestRef.current = true;
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Determine the appropriate command based on the platform
    const listCommand = `ls -la "${path}"`;
    setLastListCommand(listCommand);
    
    const success = onSendCommand(listCommand);
    
    if (!success) {
      setError('Failed to send directory listing command');
      setLoading(false);
      setLastListCommand('');
      pendingRequestRef.current = false;
      return;
    }
    
    // Set timeout to stop loading if no response
    timeoutRef.current = setTimeout(() => {
      setLoading(false);
      pendingRequestRef.current = false;
      if (directoryItems.length === 0) {
        setError('No response from server');
      }
      timeoutRef.current = null;
    }, 5000);
  }, [isConnected, onSendCommand]); // Removed loading and directoryItems.length from dependencies

  useEffect(() => {
    if (isConnected) {
      loadDirectory('/');
    } else {
      setDirectoryItems([]);
      setError('');
      pendingRequestRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [isConnected, loadDirectory]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const parseDirectoryOutput = (output, path) => {
    const items = [];
    if (!output || typeof output !== 'string') return items;

    const lines = output.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('total ') || trimmed === '') continue;
      
      // Parse Unix ls -la format
      const unixMatch = trimmed.match(/^([d-])([rwx-]{9})\s+\d+\s+\S+\s+\S+\s+\d+\s+\S+\s+\d+\s+[\d:]+\s+(.+)$/);
      if (unixMatch) {
        const [, type, permissions, name] = unixMatch;
        if (name && name !== '.') {
          items.push({
            name,
            isDirectory: type === 'd',
            permissions: type + permissions
          });
        }
        continue;
      }

      // Parse Windows dir format
      const windowsMatch = trimmed.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}\s+[AP]M)\s+(<DIR>|\d+)\s+(.+)$/);
      if (windowsMatch) {
        const [, , , sizeOrDir, name] = windowsMatch;
        if (name && name !== '.') {
          items.push({
            name,
            isDirectory: sizeOrDir === '<DIR>',
            permissions: sizeOrDir === '<DIR>' ? 'drwxr-xr-x' : '-rw-r--r--'
          });
        }
        continue;
      }

      // Simple format fallback
      if (trimmed.length > 0 && !trimmed.includes('Permission denied') && 
          !trimmed.includes('No such file') && !trimmed.includes('cannot access') &&
          !trimmed.includes('ls:') && !trimmed.includes('dir:')) {
        items.push({
          name: trimmed,
          isDirectory: false, // Default to file unless we can determine otherwise
          permissions: '-rw-r--r--'
        });
      }
    }

    return items;
  };

  const handleItemClick = (item) => {
    if (item.isDirectory) {
      const newPath = item.name === '..' 
        ? (currentPath === '/' ? '/' : currentPath.split('/').slice(0, -1).join('/') || '/')
        : `${currentPath}/${item.name}`.replace(/\/+/g, '/');
      
      setCurrentPath(newPath);
      onDirectoryChange(newPath);
      
      // Send cd command and then list the new directory
      onSendCommand(`cd "${newPath}"`);
      setTimeout(() => loadDirectory(newPath), 100);
    } else {
      // For files, show file info
      const filePath = `${currentPath}/${item.name}`.replace(/\/+/g, '/');
      onSendCommand(`file "${filePath}" 2>/dev/null || echo "File: ${filePath}"`);
    }
  };

  const navigateUp = () => {
    if (currentPath === '/') return;
    
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    setCurrentPath(parentPath);
    onDirectoryChange(parentPath);
    onSendCommand(`cd "${parentPath}"`);
    setTimeout(() => loadDirectory(parentPath), 100);
  };

  const refreshCurrent = () => {
    if (!pendingRequestRef.current) {
      loadDirectory(currentPath);
    }
  };

  return (
    <div className="file-explorer">
      <div className="explorer-header">
        <div className="explorer-title">File Explorer</div>
        <div className="explorer-controls">
          <button 
            onClick={navigateUp} 
            className="nav-button"
            disabled={!isConnected || currentPath === '/'}
            title="Go up one directory"
          >
            ↑
          </button>
          <button 
            onClick={refreshCurrent} 
            className="nav-button"
            disabled={!isConnected || loading}
            title="Refresh current directory"
          >
            {loading ? '⟳' : '↻'}
          </button>
        </div>
      </div>
      
      <div className="current-path">
        <span className="path-label">Path:</span>
        <span className="path-value">{currentPath}</span>
      </div>

      <div className="tree-container">
        {!isConnected ? (
          <div className="explorer-message">Not connected to server</div>
        ) : error ? (
          <div className="explorer-message error">{error}</div>
        ) : loading ? (
          <div className="explorer-message">Loading directory...</div>
        ) : directoryItems.length === 0 ? (
          <div className="explorer-message">Directory is empty or no data received</div>
        ) : (
          <div className="tree-content">
            <div className="tree-instructions">
              Click folders to navigate, files to inspect
            </div>
            {directoryItems.map((item, index) => (
              <div 
                key={`${item.name}-${index}`} 
                className="tree-item"
                onClick={() => handleItemClick(item)}
              >
                <div className={`tree-item-content ${item.isDirectory ? 'directory' : 'file'}`}>
                  <span className={`item-icon ${item.isDirectory ? 'folder' : 'file'}`}>
                    {item.isDirectory ? '📁' : '📄'}
                  </span>
                  <span className="item-name">{item.name}</span>
                  <span className="item-permissions">{item.permissions}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileExplorer;