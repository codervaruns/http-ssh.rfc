
Submissions repository for `ASOC17` - HTTP-SSH App

> [!NOTE]
All discussions regarding `ASOC17: HTTP-SSH App` shall take place in [https://github.com/orgs/acm-avv/discussions/17](https://github.com/orgs/acm-avv/discussions/17).

## Overview
In-order to be eligible to work on this project as **Request for Code** under the banner of **Amrita Summer of Code, 2025**, you are required to form a team of size 1-4 and have all the members register at [amsoc.vercel.app](https://amsoc.vercel.app)

## Project Manager Details
@Ashrockzzz2003 
```json
"Name": "Ashwin Narayanan S",
"Year": "Alumni",
"Roll": "CB.EN.U4CSE21008",
"GitHub": "@Ashrockzzz2003",
```

## How to Apply
Type out a message in [https://github.com/orgs/acm-avv/discussions/17](https://github.com/orgs/acm-avv/discussions/17) with the following details:
1. Team Name
2. Team Members' Names, Roll-Numbers and respective GitHub usernames
3. Tag the project manager as **@username**

## Guidelines
1. Keep all discussions limited to this discussion channel by tagging the project manager via **@username**
2. Do not try to contact the project manager personally unless they are open to it.
4. Maintain decorum and avoid any misbehavior with the project manager. This can be subjected to disqualification.
5. Send us an update every week with regards to your progress for your respective project. If we do not receive an update for more than 10 days then your team will be disqualified automatically.

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
