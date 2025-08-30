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
      
      // Update current directory if server provides it
      if (commandOutput.currentDirectory && commandOutput.currentDirectory !== currentPath) {
        console.log('Updating path from server:', commandOutput.currentDirectory);
        setCurrentPath(commandOutput.currentDirectory);
        onDirectoryChange(commandOutput.currentDirectory);
      }
      
      // Check if this is a directory listing command we sent
      if (command === lastListCommand || 
          command.match(/^(?:ls|dir)\s+(?:-[la]+\s+)?/)) {
        
        try {
          const targetPath = commandOutput.currentDirectory || currentPath;
          const items = parseDirectoryOutput(commandOutput.stdout, targetPath);
          
          if (items.length > 0 || commandOutput.stdout.includes('total ')) {
            setDirectoryItems(items);
            setError('');
            
            // Notify parent about directory contents for auto-completion
            if (onDirectoryContentsLoaded) {
              onDirectoryContentsLoaded(targetPath, items);
            }
          } else if (commandOutput.stderr && commandOutput.stderr.includes('Permission denied')) {
            setError('Permission denied');
            setDirectoryItems([]);
          } else if (commandOutput.stderr && commandOutput.stderr.includes('No such file')) {
            setError('Directory not found');
            setDirectoryItems([]);
          } else {
            setError('Directory is empty or could not be read');
            setDirectoryItems([]);
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
  }, [commandOutput, lastListCommand]); // Removed currentPath and onDirectoryChange dependencies

  const loadDirectory = useCallback((path) => {
    if (!isConnected) {
      console.log('LoadDirectory blocked: not connected');
      return;
    }
    
    if (pendingRequestRef.current) {
      console.log('LoadDirectory blocked: request already pending');
      return;
    }
    
    // Handle current directory shortcut
    let actualPath = path;
    if (path === '.') {
      actualPath = currentPath;
    }
    
    // Normalize the path
    const normalizedPath = actualPath.replace(/\/+/g, '/');
    
    // Prevent duplicate requests for the same path
    if (lastListCommand === `ls -la "${normalizedPath}"`) {
      console.log('LoadDirectory blocked: same command already sent');
      return;
    }
    
    console.log('Loading directory:', normalizedPath);
    setLoading(true);
    setError('');
    pendingRequestRef.current = true;
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // Use ls -la for detailed listing
    const listCommand = `ls -la "${normalizedPath}"`;
    setLastListCommand(listCommand);
    
    console.log('Sending command:', listCommand);
    const success = onSendCommand(listCommand);
    
    if (!success) {
      console.error('Failed to send command');
      setError('Failed to send directory listing command');
      setLoading(false);
      setLastListCommand('');
      pendingRequestRef.current = false;
      return;
    }
    
    // Set timeout to stop loading if no response
    timeoutRef.current = setTimeout(() => {
      console.log('Directory listing timeout for:', normalizedPath);
      setLoading(false);
      pendingRequestRef.current = false;
      setError('No response from server - timeout after 5 seconds');
      setLastListCommand('');
      timeoutRef.current = null;
    }, 5000);
  }, [isConnected, onSendCommand, lastListCommand, currentPath]);

  const initialLoadRef = useRef(false);
  
  useEffect(() => {
    console.log('Connection status changed:', isConnected);
    if (!isConnected) {
      initialLoadRef.current = false;
      setDirectoryItems([]);
      setError('');
      pendingRequestRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
    // Removed automatic directory loading - wait for server to provide current directory
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
    console.log('Parsing directory output for path:', path);
    console.log('Output length:', output?.length || 0);
    
    const items = [];
    if (!output || typeof output !== 'string') {
      console.log('Invalid output type:', typeof output);
      return items;
    }

    const lines = output.split('\n').filter(line => line.trim());
    console.log('Total lines to parse:', lines.length);
    
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
        // Check if line looks like a filename (not an error message)
        if (!trimmed.includes(':') || trimmed.endsWith(':')) {
          items.push({
            name: trimmed.replace(/:$/, ''), // Remove trailing colon if present
            isDirectory: trimmed.endsWith(':'), // Common directory indicator
            permissions: '-rw-r--r--'
          });
        }
      }
    }

    console.log('Parsed items:', items.length);
    return items;
  };

  const handleItemClick = (item) => {
    if (pendingRequestRef.current) {
      console.log('Ignoring click - request pending');
      return;
    }

    console.log('Item clicked:', item);
    
    if (item.isDirectory) {
      let targetPath;
      
      if (item.name === '..') {
        // Go to parent directory
        targetPath = '..';
      } else {
        // Go to subdirectory - use relative path
        targetPath = item.name;
      }
      
      console.log('Navigating to relative path:', targetPath);
      
      // Send cd command with relative path
      onSendCommand(`cd ${targetPath}`);
      
      // Small delay to let cd command complete
      setTimeout(() => {
        if (!pendingRequestRef.current) {
          // Load current directory after cd
          loadDirectory('.');
        }
      }, 100);
    } else {
      // For files, show file info using relative path
      const filePath = item.name;
      
      console.log('Showing file info for:', filePath);
      onSendCommand(`file "${filePath}" 2>/dev/null || echo "File: ${filePath}"`);
    }
  };

  const navigateUp = () => {
    if (currentPath === '/' || currentPath === '') return;
    
    console.log('Navigating up from', currentPath);
    
    onSendCommand('cd ..');
    setTimeout(() => {
      if (!pendingRequestRef.current) {
        loadDirectory('.');
      }
    }, 100);
  };

  const refreshCurrent = () => {
    if (!pendingRequestRef.current) {
      console.log('Refreshing current directory');
      loadDirectory('.');
    }
  };

  // Listen for directory changes from the terminal/server and load directory contents
  useEffect(() => {
    if (currentPath && isConnected && !pendingRequestRef.current) {
      console.log('Current directory changed to:', currentPath);
      // Small delay to let any pending operations complete
      setTimeout(() => {
        if (!pendingRequestRef.current) {
          loadDirectory(currentPath);
        }
      }, 200);
    }
  }, [currentPath, isConnected, loadDirectory]);

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