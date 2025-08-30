class WebSocketService {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.messageHandlers = new Set();
    this.connectionHandlers = new Set();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 1000;
    this.shouldReconnect = true;
    this.connectionUrl = 'ws://localhost:8080/ws/test-room';
    this.healthCheckUrl = 'http://localhost:8080/health';
    this.connectionTimeout = 10000;
    this.connectionTimeoutId = null;
    this.connectTime = null;
    this.pingInterval = null;
    this.pingIntervalTime = 25000; // Send ping every 25 seconds (slightly less than server's 30s)
    this.connectionEstablished = false;
    this.lastPongReceived = null; // Track when we last received a pong
    this.missedPongs = 0; // Count missed pongs
    this.maxMissedPongs = 3; // Max missed pongs before considering connection dead
    
    // Enhanced retry logic properties
    this.firewallDetected = false;
    this.consecutiveFailures = 0;
    this.lastSuccessfulConnection = null;
    this.retryStrategy = 'exponential'; // 'exponential' or 'aggressive'
    this.healthCheckEnabled = true;
    this.maxConsecutiveFailures = 10;
    this.aggressiveRetryThreshold = 3;
    
    // Circuit breaker pattern
    this.circuitBreakerState = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.circuitBreakerTimeout = 30000; // 30 seconds
    this.circuitBreakerFailureThreshold = 5;
    this.circuitBreakerResetTime = null;
    
    // Smart firewall detection
    this.connectionAttempts = [];
    this.maxConnectionHistory = 10;
  }

  // Circuit breaker logic
  canAttemptConnection() {
    const now = Date.now();
    
    switch (this.circuitBreakerState) {
      case 'CLOSED':
        return true;
      case 'OPEN':
        if (now >= this.circuitBreakerResetTime) {
          this.circuitBreakerState = 'HALF_OPEN';
          console.log('Circuit breaker moving to HALF_OPEN state');
          return true;
        }
        return false;
      case 'HALF_OPEN':
        return true;
      default:
        return true;
    }
  }

  recordConnectionAttempt(success, duration, errorCode = null) {
    const attempt = {
      timestamp: Date.now(),
      success,
      duration,
      errorCode
    };
    
    this.connectionAttempts.push(attempt);
    if (this.connectionAttempts.length > this.maxConnectionHistory) {
      this.connectionAttempts.shift();
    }
    
    // Update circuit breaker state
    if (success) {
      this.consecutiveFailures = 0;
      this.circuitBreakerState = 'CLOSED';
      this.lastSuccessfulConnection = Date.now();
    } else {
      this.consecutiveFailures++;
      
      if (this.consecutiveFailures >= this.circuitBreakerFailureThreshold && 
          this.circuitBreakerState === 'CLOSED') {
        this.circuitBreakerState = 'OPEN';
        this.circuitBreakerResetTime = Date.now() + this.circuitBreakerTimeout;
        console.log(`Circuit breaker OPEN - too many failures (${this.consecutiveFailures})`);
      }
    }
  }

  // Smart firewall detection based on connection patterns
  detectFirewallIssues() {
    if (this.connectionAttempts.length < 3) return false;
    
    const recentAttempts = this.connectionAttempts.slice(-5);
    const immediateFailures = recentAttempts.filter(attempt => 
      !attempt.success && attempt.duration < 1000 && 
      (attempt.errorCode === 1006 || attempt.errorCode === null)
    ).length;
    
    const timeouts = recentAttempts.filter(attempt =>
      !attempt.success && attempt.duration >= this.connectionTimeout
    ).length;
    
    // Firewall likely if multiple immediate failures or consistent timeouts
    return immediateFailures >= 3 || timeouts >= 2;
  }

  // Conditional health check - only when circuit breaker is open or many failures
  async checkServerHealth() {
    if (!this.healthCheckEnabled) return true;
    
    // Skip health check for normal operations, only use when circuit breaker is open
    if (this.circuitBreakerState === 'CLOSED' && this.consecutiveFailures < 3) {
      return true;
    }
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // Shorter timeout
      
      const response = await fetch(this.healthCheckUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log('Server health check passed');
        return true;
      } else {
        console.warn('Server health check failed:', response.status);
        return false;
      }
    } catch (error) {
      console.warn('Health check failed:', error.message);
      return false;
    }
  }

  async connect(url = this.connectionUrl) {
    // Check circuit breaker
    if (!this.canAttemptConnection()) {
      console.log('Circuit breaker OPEN - skipping connection attempt');
      this.notifyConnectionHandlers({
        type: 'error',
        error: new Error('Circuit breaker open - too many recent failures'),
        isCircuitBreakerOpen: true
      });
      return;
    }
    
    // Prevent multiple concurrent connection attempts
    if (this.isConnecting || this.isConnected) {
      console.log('Already connecting or connected');
      return;
    }

    this.connectionUrl = url;
    this.isConnecting = true;
    
    // Extract base URL for health check
    this.healthCheckUrl = url.replace(/^ws/, 'http').replace(/\/ws\/.*$/, '/health');
    
    // Conditional health check
    const healthOk = await this.checkServerHealth();
    if (!healthOk && this.circuitBreakerState === 'OPEN') {
      console.log('Health check failed and circuit breaker open');
      this.isConnecting = false;
      this.recordConnectionAttempt(false, 0);
      this.notifyConnectionHandlers({
        type: 'error',
        error: new Error('Server health check failed - server may be down'),
        isHealthCheckFailure: true
      });
      
      if (this.shouldReconnect) {
        this.handleReconnect();
      }
      return;
    }
    
    // Clear any existing timeout
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
    }
    
    try {
      console.log(`Attempting to connect to ${url}`);
      this.ws = new WebSocket(url);
      
      this.connectTime = Date.now();
      
      // Update firewall detection
      this.firewallDetected = this.detectFirewallIssues();
      
      // Dynamic timeout based on detection
      const timeoutDuration = this.firewallDetected ? 15000 : this.connectionTimeout;
      this.connectionTimeoutId = setTimeout(() => {
        if (this.isConnecting) {
          const duration = Date.now() - this.connectTime;
          console.log(`Connection timeout after ${duration}ms`);
          
          this.isConnecting = false;
          this.recordConnectionAttempt(false, duration);
          
          if (this.ws) {
            this.ws.close();
          }
          
          this.notifyConnectionHandlers({
            type: 'error',
            error: new Error('Connection timeout - network or firewall issue'),
            isFirewallIssue: this.detectFirewallIssues()
          });
        }
      }, timeoutDuration);
      
      this.ws.onopen = () => {
        const connectionTime = Date.now() - this.connectTime;
        console.log(`WebSocket connected successfully in ${connectionTime}ms`);
        
        // Record successful connection
        this.recordConnectionAttempt(true, connectionTime);
        
        // Clear any existing timeout
        if (this.connectionTimeoutId) {
          clearTimeout(this.connectionTimeoutId);
          this.connectionTimeoutId = null;
        }
        this.isConnected = true;
        this.isConnecting = false;
        this.connectionEstablished = true;
        this.reconnectAttempts = 0;
        this.shouldReconnect = true;
        
        // Add debugging to check WebSocket state
        console.log('WebSocket readyState:', this.ws.readyState);
        console.log('WebSocket URL:', this.ws.url);
        console.log('WebSocket protocol:', this.ws.protocol);
        
        // Start ping mechanism to keep connection alive
        this.startPing();
        
        // Send initial connection message to server with delay to ensure server is ready
        setTimeout(() => {
          if (this.isConnected && this.ws) {
            this.sendMessage('connection', { 
              type: 'client_connected',
              timestamp: Date.now(),
              userAgent: navigator.userAgent
            });
          }
        }, 100);
        
        this.notifyConnectionHandlers({ type: 'connected', url });
      };

      this.ws.onmessage = (event) => {
        console.log('Received WebSocket message:', event.data);
        try {
          const message = JSON.parse(event.data);
          console.log('Parsed message:', message);
          
          // Handle server ping - respond with pong immediately
          if (message.type === 'ping') {
            console.log('Received ping from server, sending pong');
            const pongMessage = {
              type: 'pong',
              timestamp: Date.now(),
              client_id: 'http-ssh-client'
            };
            this.ws.send(JSON.stringify(pongMessage));
            this.hb = Date.now(); // Update heartbeat time
            return;
          }
          
          // Handle server pong responses to our pings
          if (message.type === 'pong') {
            console.log('Received pong from server');
            this.lastPongReceived = Date.now();
            this.missedPongs = 0; // Reset missed pong counter
            return;
          }
          
          // Handle system messages
          if (message.type === 'system_message') {
            console.log('System message:', message.payload.message);
            this.notifyMessageHandlers({
              type: 'stdout',
              data: `[SYSTEM] ${message.payload.message}`,
              timestamp: Date.now(),
              isSystem: true
            });
            return;
          }
          
          // Log all message types for debugging
          console.log('Message type:', message.type);
          if (message.type === 'stdout' || message.type === 'stderr') {
            console.log('Stream data length:', (message.data || message.payload?.data || '').length);
          }
          
          this.notifyMessageHandlers(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
          console.log('Raw message data:', event.data);
          
          // Try to handle non-JSON messages as raw stdout
          if (typeof event.data === 'string' && event.data.trim()) {
            const rawMessage = {
              type: 'stdout',
              data: event.data,
              timestamp: Date.now()
            };
            this.notifyMessageHandlers(rawMessage);
          }
        }
      };

      this.ws.onclose = (event) => {
        const connectionDuration = this.connectTime ? Date.now() - this.connectTime : 0;
        console.log(`WebSocket disconnected after ${connectionDuration}ms (code: ${event.code})`);
        
        // Record failed connection attempt
        this.recordConnectionAttempt(false, connectionDuration, event.code);
        
        // Update firewall detection
        this.firewallDetected = this.detectFirewallIssues();
        
        this.consecutiveFailures++;
        
        // Stop ping mechanism
        this.stopPing();
        
        if (this.connectionTimeoutId) {
          clearTimeout(this.connectionTimeoutId);
          this.connectionTimeoutId = null;
        }
        this.isConnected = false;
        this.isConnecting = false;
        
        // Check if this was an immediate disconnect (less than 2 seconds)
        const wasImmediateDisconnect = connectionDuration < 2000 && this.connectionEstablished;
        
        if (wasImmediateDisconnect && event.code === 1000) {
          console.warn('Server closed connection immediately after connecting - this may indicate a server-side issue');
        }
        
        // Reset connection established flag
        this.connectionEstablished = false;
        
        // Provide more descriptive disconnect reasons
        let disconnectReason = this.getDisconnectReason(event.code);
        this.notifyConnectionHandlers({ 
          type: 'disconnected', 
          code: event.code, 
          reason: event.reason || disconnectReason,
          wasClean: event.wasClean,
          duration: connectionDuration,
          wasImmediateDisconnect
        });
        
        // Enhanced reconnection logic with circuit breaker
        if (this.shouldReconnect && this.canAttemptConnection()) {
          // Switch to aggressive retry for firewall issues
          if (this.firewallDetected && this.consecutiveFailures >= this.aggressiveRetryThreshold) {
            this.retryStrategy = 'aggressive';
            console.log('Switching to aggressive retry for detected firewall issues');
          }
          
          this.handleReconnect();
        } else if (this.circuitBreakerState === 'OPEN') {
          console.log('Circuit breaker open - delaying reconnection');
          this.notifyConnectionHandlers({
            type: 'reconnect_delayed',
            reason: 'circuit_breaker_open',
            retryAfter: Math.round((this.circuitBreakerResetTime - Date.now()) / 1000)
          });
        }
      };

      this.ws.onerror = (error) => {
        const connectionTime = this.connectTime ? Date.now() - this.connectTime : 0;
        console.error(`WebSocket error after ${connectionTime}ms:`, error);
        
        // Record error
        this.recordConnectionAttempt(false, connectionTime);
        
        // Enhanced error detection
        const isFirewallIssue = this.detectFirewallIssues();
        const errorMessage = isFirewallIssue ?
          'Connection blocked - firewall or network filtering detected' :
          (this.isConnected ? 'Connection error occurred' : 'Failed to connect - check server status');
        
        this.notifyConnectionHandlers({
          type: 'error',
          error: new Error(errorMessage),
          isFirewallIssue
        });
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.recordConnectionAttempt(false, 0);
      this.consecutiveFailures++;
      this.isConnecting = false;
      if (this.connectionTimeoutId) {
        clearTimeout(this.connectionTimeoutId);
        this.connectionTimeoutId = null;
      }
      this.notifyConnectionHandlers({ type: 'error', error });
    }
  }

  getDisconnectReason(code) {
    const reasons = {
      1000: 'Normal closure',
      1001: 'Going away',
      1002: 'Protocol error',
      1003: 'Unsupported data',
      1004: 'Reserved',
      1005: 'No status',
      1006: 'Abnormal closure - connection lost',
      1007: 'Invalid data',
      1008: 'Policy violation',
      1009: 'Message too big',
      1010: 'Missing extension',
      1011: 'Internal error',
      1012: 'Service restart',
      1013: 'Try again later',
      1014: 'Bad gateway',
      1015: 'TLS handshake'
    };
    return reasons[code] || `Unknown error (${code})`;
  }

  disconnect() {
    this.shouldReconnect = false;
    this.reconnectAttempts = this.maxReconnectAttempts; // Stop any pending reconnections
    
    // Stop ping mechanism
    this.stopPing();
    
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
    
    if (this.ws) {
      this.ws.close(1000, 'User disconnected');
      this.ws = null;
    }
    
    this.isConnected = false;
    this.isConnecting = false;
  }

  sendCommand(command) {
    if (this.isConnected && this.ws) {
      const message = {
        type: 'command',
        payload: {
          command: command,
          timestamp: Date.now()
        }
      };
      
      try {
        console.log('Sending command:', message);
        this.ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Failed to send command:', error);
        return false;
      }
    } else {
      console.log('Cannot send command - not connected. isConnected:', this.isConnected, 'ws:', !!this.ws);
      return false;
    }
  }

  // Stub method for sending other message types
  sendMessage(type, payload) {
    if (this.isConnected && this.ws) {
      const message = { type, payload, timestamp: Date.now() };
      
      try {
        console.log('Sending message:', message);
        this.ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Failed to send message:', error);
        return false;
      }
    } else {
      console.log('Cannot send message - not connected. isConnected:', this.isConnected, 'ws:', !!this.ws);
      return false;
    }
  }

  handleReconnect() {
    if (!this.shouldReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.log('Max reconnection attempts reached. Stopping reconnection.');
        this.notifyConnectionHandlers({ 
          type: 'reconnect_failed', 
          attempts: this.reconnectAttempts 
        });
      }
      return;
    }

    // Check circuit breaker before scheduling reconnect
    if (!this.canAttemptConnection()) {
      const delayUntilReset = Math.max(0, this.circuitBreakerResetTime - Date.now());
      console.log(`Circuit breaker open - delaying reconnect by ${Math.round(delayUntilReset/1000)}s`);
      
      setTimeout(() => {
        if (this.shouldReconnect) {
          this.handleReconnect();
        }
      }, delayUntilReset + 1000); // Add 1s buffer
      return;
    }

    this.reconnectAttempts++;
    console.log(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts}) [${this.retryStrategy}] [CB: ${this.circuitBreakerState}]`);
    
    this.notifyConnectionHandlers({ 
      type: 'reconnecting', 
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      strategy: this.retryStrategy,
      firewallDetected: this.firewallDetected
    });
    
    let delay;
    if (this.retryStrategy === 'aggressive' || this.firewallDetected) {
      // Aggressive: 1s, 1s, 1s, then exponential
      if (this.reconnectAttempts <= 3) {
        delay = 1000;
      } else {
        delay = Math.min(3000 * Math.pow(1.3, this.reconnectAttempts - 3), 20000);
      }
    } else {
      // Standard exponential backoff
      delay = this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);
    }
    
    const actualDelay = Math.min(delay, 30000);
    
    setTimeout(() => {
      if (this.shouldReconnect && this.reconnectAttempts <= this.maxReconnectAttempts) {
        this.connect(this.connectionUrl);
      }
    }, actualDelay);
  }

  addMessageHandler(handler) {
    this.messageHandlers.add(handler);
  }

  removeMessageHandler(handler) {
    this.messageHandlers.delete(handler);
  }

  addConnectionHandler(handler) {
    this.connectionHandlers.add(handler);
  }

  removeConnectionHandler(handler) {
    this.connectionHandlers.delete(handler);
  }

  notifyMessageHandlers(message) {
    this.messageHandlers.forEach(handler => {
      try {
        handler(message);
      } catch (error) {
        console.error('Message handler error:', error);
      }
    });
  }

  notifyConnectionHandlers(event) {
    this.connectionHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('Connection handler error:', error);
      }
    });
  }

  getConnectionStatus() {
    return this.isConnected;
  }

  // Reset connection state for manual reconnection
  resetReconnection() {
    this.reconnectAttempts = 0;
    this.consecutiveFailures = 0;
    this.firewallDetected = false;
    this.retryStrategy = 'exponential';
    this.shouldReconnect = true;
    this.circuitBreakerState = 'CLOSED';
    this.connectionAttempts = [];
  }

  // Get diagnostic information
  getConnectionDiagnostics() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      consecutiveFailures: this.consecutiveFailures,
      firewallDetected: this.firewallDetected,
      retryStrategy: this.retryStrategy,
      circuitBreakerState: this.circuitBreakerState,
      lastSuccessfulConnection: this.lastSuccessfulConnection,
      connectionUrl: this.connectionUrl,
      healthCheckUrl: this.healthCheckUrl,
      recentAttempts: this.connectionAttempts.slice(-5)
    };
  }

  // Enhanced ping mechanism with pong tracking
  startPing() {
    // Clear any existing ping interval
    this.stopPing();
    
    // Initialize tracking variables
    this.lastPongReceived = Date.now();
    this.missedPongs = 0;
    
    this.pingInterval = setInterval(() => {
      if (this.isConnected && this.ws) {
        try {
          // Check if we've missed too many pongs
          const timeSinceLastPong = Date.now() - (this.lastPongReceived || Date.now());
          const expectedPongInterval = this.pingIntervalTime * 1.5; // Allow 1.5x ping interval for pong
          
          if (timeSinceLastPong > expectedPongInterval) {
            this.missedPongs++;
            console.warn(`Missed pong #${this.missedPongs}, time since last pong: ${Math.round(timeSinceLastPong/1000)}s`);
            
            if (this.missedPongs >= this.maxMissedPongs) {
              console.error(`Connection appears dead - missed ${this.missedPongs} pongs. Closing connection.`);
              this.ws.close(1006, 'Connection timeout - no pong responses');
              return;
            }
          }
          
          console.log('Sending ping to server');
          const pingMessage = {
            type: 'ping',
            timestamp: Date.now(),
            client_id: 'http-ssh-client'
          };
          this.ws.send(JSON.stringify(pingMessage));
          
          // Also send a WebSocket protocol ping as backup
          if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.ping && this.ws.ping();
          }
          
        } catch (error) {
          console.error('Failed to send ping:', error);
          this.missedPongs++;
        }
      } else {
        console.log('Skipping ping - not connected');
      }
    }, this.pingIntervalTime);
    
    console.log(`Started ping mechanism with ${this.pingIntervalTime}ms interval`);
  }

  // Stop ping mechanism
  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
      console.log('Stopped ping mechanism');
    }
    // Reset tracking variables
    this.lastPongReceived = null;
    this.missedPongs = 0;
  }
}

const webSocketService = new WebSocketService();
export default webSocketService;
