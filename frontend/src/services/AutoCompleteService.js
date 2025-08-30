class AutoCompleteService {
  constructor() {
    this.commonCommands = [
      'ls', 'cd', 'pwd', 'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'cat', 'grep',
      'find', 'chmod', 'chown', 'ps', 'kill', 'top', 'htop', 'df', 'du',
      'tar', 'zip', 'unzip', 'wget', 'curl', 'ssh', 'scp', 'rsync',
      'git', 'nano', 'vim', 'emacs', 'head', 'tail', 'sort', 'uniq',
      'wc', 'diff', 'file', 'which', 'whereis', 'man', 'history',
      'clear', 'exit', 'logout', 'su', 'sudo', 'whoami', 'id',
      'date', 'uptime', 'uname', 'hostname', 'ping', 'netstat',
      'iptables', 'systemctl', 'service', 'mount', 'umount'
    ];
    
    this.commandHistory = [];
    this.currentDirectory = '/';
    this.directoryContents = new Map(); // Cache directory contents
  }

  // Update command history
  addToHistory(command) {
    if (command.trim() && !this.commandHistory.includes(command.trim())) {
      this.commandHistory.unshift(command.trim());
      // Keep only last 100 commands
      if (this.commandHistory.length > 100) {
        this.commandHistory = this.commandHistory.slice(0, 100);
      }
    }
  }

  // Update current directory
  setCurrentDirectory(path) {
    this.currentDirectory = path;
  }

  // Cache directory contents for path completion
  cacheDirectoryContents(path, contents) {
    this.directoryContents.set(path, contents);
  }

  // Get completions for the current input
  getCompletions(input, cursorPosition = input.length) {
    const beforeCursor = input.slice(0, cursorPosition);
    const afterCursor = input.slice(cursorPosition);
    
    // Split by spaces to find the current token
    const tokens = beforeCursor.split(/\s+/);
    const currentToken = tokens[tokens.length - 1] || '';
    const isFirstToken = tokens.length === 1 || (tokens.length === 2 && beforeCursor.endsWith(' ') === false);
    
    let suggestions = [];
    
    if (isFirstToken) {
      // Command completion
      suggestions = this.getCommandCompletions(currentToken);
    } else {
      // Parameter completion (files, directories, etc.)
      const command = tokens[0];
      suggestions = this.getParameterCompletions(command, currentToken);
    }
    
    // Add history-based suggestions
    const historySuggestions = this.getHistoryCompletions(beforeCursor);
    suggestions = [...suggestions, ...historySuggestions];
    
    // Remove duplicates and sort
    suggestions = [...new Set(suggestions)].sort();
    
    return {
      suggestions,
      startIndex: cursorPosition - currentToken.length,
      endIndex: cursorPosition,
      currentToken
    };
  }

  // Get command completions
  getCommandCompletions(partial) {
    return this.commonCommands
      .filter(cmd => cmd.startsWith(partial.toLowerCase()))
      .map(cmd => ({
        text: cmd,
        type: 'command',
        description: this.getCommandDescription(cmd)
      }));
  }

  // Get parameter completions (files, directories)
  getParameterCompletions(command, partial) {
    const suggestions = [];
    
    // File/directory completion for commands that work with paths
    if (['ls', 'cd', 'cat', 'rm', 'cp', 'mv', 'chmod', 'chown', 'file'].includes(command)) {
      suggestions.push(...this.getPathCompletions(partial));
    }
    
    // Command-specific completions
    switch (command) {
      case 'git':
        suggestions.push(...this.getGitCompletions(partial));
        break;
      case 'systemctl':
        suggestions.push(...this.getSystemctlCompletions(partial));
        break;
      case 'chmod':
        suggestions.push(...this.getChmodCompletions(partial));
        break;
    }
    
    return suggestions;
  }

  // Get path completions
  getPathCompletions(partial) {
    const suggestions = [];
    
    // Determine the directory to search
    let searchDir = this.currentDirectory;
    let searchPattern = partial;
    
    if (partial.includes('/')) {
      const lastSlash = partial.lastIndexOf('/');
      searchPattern = partial.slice(lastSlash + 1);
      
      if (partial.startsWith('/')) {
        // Absolute path
        searchDir = partial.slice(0, lastSlash) || '/';
      } else {
        // Relative path
        const relativePath = partial.slice(0, lastSlash);
        searchDir = this.resolvePath(this.currentDirectory, relativePath);
      }
    }
    
    // Get cached directory contents
    const contents = this.directoryContents.get(searchDir) || [];
    
    // Filter and format suggestions
    contents
      .filter(item => item.name.startsWith(searchPattern))
      .forEach(item => {
        const isDirectory = item.isDirectory;
        const fullPath = partial.includes('/') 
          ? partial.slice(0, partial.lastIndexOf('/') + 1) + item.name + (isDirectory ? '/' : '')
          : item.name + (isDirectory ? '/' : '');
        
        suggestions.push({
          text: fullPath,
          type: isDirectory ? 'directory' : 'file',
          description: isDirectory ? 'Directory' : 'File',
          icon: isDirectory ? '📁' : '📄'
        });
      });
    
    // Add common directory shortcuts
    if (searchPattern === '' || '.'.startsWith(searchPattern)) {
      suggestions.push({
        text: './',
        type: 'directory',
        description: 'Current directory',
        icon: '📁'
      });
    }
    
    if (searchPattern === '' || '..'.startsWith(searchPattern)) {
      suggestions.push({
        text: '../',
        type: 'directory',
        description: 'Parent directory',
        icon: '📁'
      });
    }
    
    return suggestions;
  }

  // Get history-based completions
  getHistoryCompletions(partial) {
    return this.commandHistory
      .filter(cmd => cmd.startsWith(partial) && cmd !== partial)
      .slice(0, 5) // Limit to 5 history suggestions
      .map(cmd => ({
        text: cmd,
        type: 'history',
        description: 'From history',
        icon: '🕒'
      }));
  }

  // Get Git subcommand completions
  getGitCompletions(partial) {
    const gitCommands = [
      'add', 'commit', 'push', 'pull', 'clone', 'status', 'log', 'diff',
      'branch', 'checkout', 'merge', 'rebase', 'reset', 'stash', 'fetch',
      'remote', 'tag', 'show', 'init', 'config'
    ];
    
    return gitCommands
      .filter(cmd => cmd.startsWith(partial))
      .map(cmd => ({
        text: cmd,
        type: 'git-command',
        description: `Git ${cmd} command`,
        icon: '🌿'
      }));
  }

  // Get systemctl completions
  getSystemctlCompletions(partial) {
    const systemctlCommands = [
      'start', 'stop', 'restart', 'reload', 'enable', 'disable',
      'status', 'is-active', 'is-enabled', 'list-units', 'daemon-reload'
    ];
    
    return systemctlCommands
      .filter(cmd => cmd.startsWith(partial))
      .map(cmd => ({
        text: cmd,
        type: 'systemctl-command',
        description: `Systemctl ${cmd} command`,
        icon: '⚙️'
      }));
  }

  // Get chmod permission completions
  getChmodCompletions(partial) {
    const permissions = ['755', '644', '600', '777', '700', '+x', '-x', '+r', '-r', '+w', '-w'];
    
    return permissions
      .filter(perm => perm.startsWith(partial))
      .map(perm => ({
        text: perm,
        type: 'permission',
        description: `File permission: ${perm}`,
        icon: '🔒'
      }));
  }

  // Get command description
  getCommandDescription(command) {
    const descriptions = {
      'ls': 'List directory contents',
      'cd': 'Change directory',
      'pwd': 'Print working directory',
      'mkdir': 'Create directories',
      'rm': 'Remove files and directories',
      'cp': 'Copy files or directories',
      'mv': 'Move/rename files or directories',
      'cat': 'Display file contents',
      'grep': 'Search text patterns',
      'find': 'Search for files and directories',
      'chmod': 'Change file permissions',
      'ps': 'Show running processes',
      'kill': 'Terminate processes',
      'git': 'Version control system',
      'nano': 'Text editor',
      'vim': 'Vi text editor',
      'clear': 'Clear terminal screen',
      'exit': 'Exit the shell'
    };
    
    return descriptions[command] || `${command} command`;
  }

  // Resolve relative path
  resolvePath(currentPath, relativePath) {
    if (relativePath.startsWith('/')) {
      return relativePath;
    }
    
    const parts = currentPath.split('/').filter(Boolean);
    const relativeParts = relativePath.split('/').filter(Boolean);
    
    for (const part of relativeParts) {
      if (part === '..') {
        parts.pop();
      } else if (part !== '.') {
        parts.push(part);
      }
    }
    
    return '/' + parts.join('/');
  }
}

const autoCompleteService = new AutoCompleteService();
export default autoCompleteService;
