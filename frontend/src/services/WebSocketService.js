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
    this.connectionTimeout = 10000;
    this.connectionTimeoutId = null;
    this.connectTime = null;
    this.pingInterval = null;
    this.pingIntervalTime = 25000; // Send ping every 25 seconds (slightly less than server's 30s)
    this.connectionEstablished = false;
    this.lastPongReceived = null; // Track when we last received a pong
    this.missedPongs = 0; // Count missed pongs
    this.maxMissedPongs = 3; // Max missed pongs before considering connection dead
  }

  connect(url = this.connectionUrl) {
    // Prevent multiple concurrent connection attempts
    if (this.isConnecting || this.isConnected) {
      console.log('Already connecting or connected');
      return;
    }

    this.connectionUrl = url;
    this.isConnecting = true;
    
    // Clear any existing timeout
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
    }
    
    try {
      console.log(`Attempting to connect to ${url}`);
      this.ws = new WebSocket(url);
      
      // Add connection start time for debugging
      this.connectTime = Date.now();
      
      // Set connection timeout
      this.connectionTimeoutId = setTimeout(() => {
        if (this.isConnecting) {
          console.log('Connection timeout');
          this.isConnecting = false;
          if (this.ws) {
            this.ws.close();
          }
          this.notifyConnectionHandlers({ 
            type: 'error', 
            error: new Error('Connection timeout - server may be unavailable')
          });
        }
      }, this.connectionTimeout);
      
      this.ws.onopen = () => {
        const connectionTime = Date.now() - this.connectTime;
        console.log(`WebSocket connected successfully in ${connectionTime}ms`);
        
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
        console.log(`WebSocket disconnected after ${connectionDuration}ms (code: ${event.code}, reason: ${event.reason})`);
        console.log('wasClean:', event.wasClean);
        console.log('Connection was established for:', connectionDuration < 1000 ? 'less than 1 second' : `${Math.round(connectionDuration/1000)} seconds`);
        
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
        
        // Only attempt reconnect if it was an unexpected disconnect and we should reconnect
        // Don't reconnect on immediate disconnects with code 1000 (likely server issue)
        if (this.shouldReconnect && !(wasImmediateDisconnect && event.code === 1000)) {
          this.handleReconnect();
        } else if (wasImmediateDisconnect && event.code === 1000) {
          console.log('Not attempting reconnect due to immediate server disconnect');
        }
      };

      this.ws.onerror = (error) => {
        const connectionTime = this.connectTime ? Date.now() - this.connectTime : 0;
        console.error(`WebSocket error after ${connectionTime}ms:`, error);
        console.log('WebSocket readyState at error:', this.ws?.readyState);
        
        if (this.connectionTimeoutId) {
          clearTimeout(this.connectionTimeoutId);
          this.connectionTimeoutId = null;
        }
        this.isConnecting = false;
        
        // Provide more helpful error message
        const errorMessage = this.isConnected ? 
          'Connection error occurred' : 
          'Failed to connect - check if server is running and URL is correct';
          
        this.notifyConnectionHandlers({ 
          type: 'error', 
          error: new Error(errorMessage)
        });
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
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
    // Don't reconnect if explicitly disconnected or max attempts reached
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

    this.reconnectAttempts++;
    console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.notifyConnectionHandlers({ 
      type: 'reconnecting', 
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts
    });
    
    // Exponential backoff: increase delay with each attempt
    const delay = this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);
    const maxDelay = 30000; // Cap at 30 seconds
    const actualDelay = Math.min(delay, maxDelay);
    
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

  // Reset reconnection state for manual reconnection
  resetReconnection() {
    this.reconnectAttempts = 0;
    this.shouldReconnect = true;
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
