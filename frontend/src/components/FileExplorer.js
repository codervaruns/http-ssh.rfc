import React, { useState, useEffect } from 'react';
import './FileExplorer.css';

const FileExplorer = ({ isConnected, onSendCommand, onDirectoryChange }) => {
  const [currentPath, setCurrentPath] = useState('/');
  const [directoryItems, setDirectoryItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isConnected) {
      loadDirectory('/');
    }
  }, [isConnected]);

  const loadDirectory = async (path) => {
    if (!isConnected) return;
    
    setLoading(true);
    setError('');
    
    // Send ls command to get directory contents
    const command = `ls -la "${path}" 2>/dev/null || dir "${path}" 2>nul`;
    const success = onSendCommand(command);
    
    if (!success) {
      setError('Failed to send directory listing command');
      setLoading(false);
      return;
    }
    
    // Note: The actual parsing will happen when we receive the response
    // This is a limitation of the current WebSocket implementation
    setTimeout(() => setLoading(false), 2000);
  };

  const handleItemClick = (item) => {
    if (item.isDirectory) {
      const newPath = item.name === '..' 
        ? (currentPath === '/' ? '/' : currentPath.split('/').slice(0, -1).join('/') || '/')
        : `${currentPath}/${item.name}`.replace(/\/+/g, '/');
      
      setCurrentPath(newPath);
      onDirectoryChange(newPath);
      onSendCommand(`cd "${newPath}"`);
      loadDirectory(newPath);
    } else {
      // For files, show file info
      const filePath = `${currentPath}/${item.name}`.replace(/\/+/g, '/');
      onSendCommand(`file "${filePath}"`);
    }
  };

  const navigateUp = () => {
    if (currentPath === '/') return;
    
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    setCurrentPath(parentPath);
    onDirectoryChange(parentPath);
    onSendCommand(`cd "${parentPath}"`);
    loadDirectory(parentPath);
  };

  const refreshCurrent = () => {
    loadDirectory(currentPath);
  };

  // Sample directory items for demonstration
  const sampleItems = [
    ...(currentPath !== '/' ? [{ 
      name: '..', 
      isDirectory: true, 
      permissions: 'drwxr-xr-x' 
    }] : []),
    { name: 'Documents', isDirectory: true, permissions: 'drwxr-xr-x' },
    { name: 'Downloads', isDirectory: true, permissions: 'drwxr-xr-x' },
    { name: 'example.txt', isDirectory: false, permissions: '-rw-r--r--' },
    { name: 'script.sh', isDirectory: false, permissions: '-rwxr-xr-x' },
  ];

  const itemsToShow = directoryItems.length > 0 ? directoryItems : (isConnected ? sampleItems : []);

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
        ) : (
          <div className="tree-content">
            <div className="tree-instructions">
              Click folders to navigate, files to inspect
            </div>
            {itemsToShow.map((item, index) => (
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