# HTTP-SSH Terminal Frontend

A React-based terminal interface for executing SSH commands over HTTP/WebSocket connections.

## Features

- **Real-time Terminal Interface**: Interactive command-line interface with command history
- **WebSocket Communication**: Real-time bidirectional communication with the backend server
- **Connection Management**: Automatic reconnection with exponential backoff
- **Command History**: Navigate through previously executed commands using arrow keys
- **Connection Status**: Visual indicators for connection state
- **Error Handling**: Comprehensive error messages and connection diagnostics

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn package manager
- Backend HTTP-SSH server running (default: `ws://localhost:3000/ws`)

## Installation

1. Clone the repository and navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

## Configuration

The application is configured to connect to the backend server at `ws://localhost:3000/ws` by default. You can modify this in the connection URL input field in the application.

### Default Settings

- **Frontend Port**: 3001 (configured in package.json)
- **Backend WebSocket URL**: `ws://localhost:3000/ws`
- **Reconnection Attempts**: 5 maximum attempts
- **Ping Interval**: 30 seconds to keep connection alive

## Running the Application

### Development Mode

Start the development server:
```bash
npm start
```

The application will open in your browser at `http://localhost:3001`.

### Production Build

Create a production build:
```bash
npm run build
```

The build files will be generated in the `build/` directory.

## Usage

### Connecting to Server

1. Ensure the HTTP-SSH backend server is running
2. Enter the WebSocket URL in the connection field (default: `ws://localhost:3000/ws`)
3. Click the "Connect" button
4. Wait for the connection status to show "Connected"

### Executing Commands

1. Type commands in the terminal input field
2. Press Enter to execute
3. View command output in the terminal display
4. Use ↑/↓ arrow keys to navigate command history

### Terminal Features

- **Command Echo**: Commands are displayed before execution
- **Timestamps**: Each command and output includes execution time
- **Error Display**: stderr output is displayed in red
- **System Messages**: Connection status and system information
- **Clear Output**: Button to clear the terminal display

## Project Structure

```
frontend/
├── public/                 # Static assets
├── src/
│   ├── services/
│   │   └── WebSocketService.js    # WebSocket connection management
│   ├── App.js             # Main application component
│   ├── App.css            # Application styles
│   └── index.js           # Application entry point
├── package.json           # Dependencies and scripts
└── README.md             # This file
```

## WebSocket Service

The `WebSocketService` class handles all WebSocket communication:

- **Connection Management**: Automatic connection, disconnection, and reconnection
- **Message Handling**: Parsing and routing of WebSocket messages
- **Error Recovery**: Exponential backoff reconnection strategy
- **Keep-Alive**: Ping/pong mechanism to maintain connection
- **Event Handlers**: Customizable handlers for messages and connection events

## Troubleshooting

### Connection Issues

1. **"Connection timeout"**: Backend server may not be running
2. **"Server closed connection immediately"**: Check backend server logs
3. **"Failed to connect"**: Verify WebSocket URL and network connectivity

### Common Solutions

- Ensure backend server is running on the correct port
- Check firewall settings
- Verify WebSocket endpoint URL
- Review browser console for detailed error messages

## Development

### Available Scripts

- `npm start`: Run development server
- `npm run build`: Create production build
- `npm test`: Run test suite
- `npm run eject`: Eject from Create React App (irreversible)

### Code Structure

- **App.js**: Main React component with terminal UI
- **WebSocketService.js**: WebSocket connection and message handling
- **App.css**: Terminal styling and responsive design

## Browser Compatibility

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is part of the HTTP-SSH RFC implementation.
