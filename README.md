
Submissions repository for `ASOC17` - HTTP-SSH App

> [!NOTE]
All discussions regarding `ASOC17: HTTP-SSH App` shall take place in [https://github.com/orgs/acm-avv/discussions/17](https://github.com/orgs/acm-avv/discussions/17).

## Project Manager Details
@Ashrockzzz2003 
```json
"Name": "Ashwin Narayanan S",
"Year": "Alumni",
"Roll": "CB.EN.U4CSE21008",
"GitHub": "@Ashrockzzz2003",
```

## Project Description

This project aims to develop a remote shell system that allows users to execute operating system commands on a remote server machine using standard web technologies. Unlike traditional SSH, all communication for commands and their outputs will be facilitated over the HTTP protocol.

## Tech Stack

<img width="50" height="50" alt="htmlIm" src="https://github.com/user-attachments/assets/063729c5-6183-4b12-9dff-feffae161cee" /> 
<img width="50" height="50" alt="cssIm" src="https://github.com/user-attachments/assets/05d5c64e-c8b5-48f2-a3bf-5dcab062c27f" />
<img width="50" height="50" alt="reactIm" src="https://github.com/user-attachments/assets/037fcc01-f579-418a-9066-5d8740e0c937" />
<img width="50" height="50" alt="nodejsIm" src="https://github.com/user-attachments/assets/9bc3535c-c465-4000-b41d-26dcc7202c9b" />
<img width="50" height="50" alt="npmIm" src="https://github.com/user-attachments/assets/a5233af1-3439-46bf-9068-7910c2dfc2b2" />
<img width="50" height="50" alt="rustIm" src="https://github.com/user-attachments/assets/1cff2e3d-468a-4562-b844-c9ffcca545e2" />
<img width="50" height="50" alt="json" src="https://github.com/user-attachments/assets/14de755d-29e5-4002-9a69-1fca14fdd3e3" />
<img width="50" height="50" alt="actix" src="https://github.com/user-attachments/assets/5f9df67b-0a2c-4cb3-8910-363d680272bc" />

## Installation Guide

1. Prerequisites
- Node.js (v14 or higher)
- npm or yarn package manager
- Rust (for backend)
- Git

2. Frontend Installation

- Clone the repository:
   git clone https://github.com/codervaruns/http-ssh.rfc.git
   cd http-ssh.rfc/frontend

- Install frontend dependencies:
   npm install

3. Start development server:
   - npm start
   - Frontend will be available at: http://localhost:3001

4. Frontend Configuration
   - Default backend WebSocket URL: ws://localhost:8080/ws
   - Connection URL can be modified in the application interface

5. Backend Installation

   - Navigate to backend directory:
      cd http-ssh.rfc/backend

   - Build and run the Rust backend:
      cargo build
      cargo run
   
6. Default Settings
   - Frontend:
       Port: 3001

7. Production Deployment

   - To create production build:
   cd frontend
   npm run build

8. Testing the Connection

   -  Start backend server
   - Launch frontend application
   - Verify WebSocket URL matches backend
   - Click connect button
   - Use terminal interface for commands

9. System Requirements
   - OS: Windows/Linux/MacOS
   - Modern web browser with WebSocket support
   - Sufficient permissions for system commands

### Core Functionality:
- Remote Command Execution: Enable users to run shell commands on a distant server.
- HTTP-Based Communication: Utilize HTTP for transmitting commands from the client to the server and for sending command outputs back to the client.
- Mimics SSH: Provide a similar user experience to SSH for remote command execution, but built entirely with web standards.

### Key Components:
- Server Application (Go or Python or any language):
    - Runs on the target remote machine.
    - Listens for incoming HTTP requests containing commands.
    - Executes received commands using the operating system's shell.
    - Captures the command's standard output (stdout), standard error (stderr), and return code.
    - Packages the output and sends it back to the client via HTTP responses.
- Client User Interface (Web Page):
    - A web-based interface accessible via a browser.
    - Allows users to input shell commands.
    - Sends these commands to the server using HTTP requests
    - Receives and displays the command output (stdout, stderr, return code) from the server.
- Technological Approach:
    - Protocol: HTTP for all client-server communication.
    - Server-Side: Command execution and HTTP handling.
    - Client-Side: Standard web technologies (HTML, CSS, JavaScript) for the user interface.

This system provides a flexible and web-friendly alternative for remote command execution, leveraging the widespread accessibility and capabilities of HTTP.
### DEMO:
![WhatsApp Image 2025-09-28 at 11 24 55_d8d7d076](https://github.com/user-attachments/assets/67af428a-d6b6-4c2e-a779-02b833b01304)
![WhatsApp Image 2025-09-28 at 11 24 55_ab95295f](https://github.com/user-attachments/assets/f2d79cbd-c9a8-4b8e-999a-1f8a851a62de)
![WhatsApp Image 2025-09-28 at 11 24 55_705d8ce3](https://github.com/user-attachments/assets/b05117e6-deb4-4f52-b8e7-7bf892491ef4)

