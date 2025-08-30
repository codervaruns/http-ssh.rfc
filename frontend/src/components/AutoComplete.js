import React from 'react';
import './AutoComplete.css';

const AutoComplete = ({ suggestions, selectedIndex, onSelect, position, visible }) => {
  if (!visible || !suggestions || suggestions.length === 0) {
    return null;
  }

  const getDefaultIcon = (type) => {
    const icons = {
      'command': '⚡',
      'file': '📄',
      'directory': '📁',
      'history': '🕒',
      'git-command': '🌿',
      'systemctl-command': '⚙️',
      'permission': '🔒'
    };
    return icons[type] || '💡';
  };

  const handleClick = (suggestion, index) => {
    onSelect(suggestion, index);
  };

  return (
    <div 
      className="autocomplete-dropdown"
      style={{
        left: position.left,
        bottom: position.bottom,
        maxHeight: '200px'
      }}
    >
      <div className="autocomplete-header">
        <span className="autocomplete-count">{suggestions.length} suggestions</span>
        <span className="autocomplete-hint">Tab to complete, ↑↓ to navigate</span>
      </div>
      <ul className="autocomplete-list">
        {suggestions.map((suggestion, index) => (
          <li
            key={`${suggestion.text}-${index}`}
            className={`autocomplete-item ${index === selectedIndex ? 'selected' : ''} ${suggestion.type}`}
            onClick={() => handleClick(suggestion, index)}
            onMouseEnter={() => onSelect(suggestion, index, false)}
          >
            <span className="autocomplete-icon">
              {suggestion.icon || getDefaultIcon(suggestion.type)}
            </span>
            <div className="autocomplete-content">
              <span className="autocomplete-text">{suggestion.text}</span>
              {suggestion.description && (
                <span className="autocomplete-description">{suggestion.description}</span>
              )}
            </div>
            <span className="autocomplete-type-badge">{suggestion.type}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AutoComplete;
