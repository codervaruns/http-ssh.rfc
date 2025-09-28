use crate::message::{ClientActorMessage, Connect, Disconnect, WsMessage};
use actix::prelude::{Actor, Context, Handler, Recipient};
use std::collections::{HashMap, HashSet};
use std::process::Command;
use uuid::Uuid;
use serde_json;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use wait_timeout::ChildExt;

type Socket = Recipient<WsMessage>;

pub struct Lobby {
    sessions: HashMap<Uuid, Socket>,
    rooms: HashMap<Uuid, HashSet<Uuid>>,
    curr_dir: HashMap<Uuid, PathBuf>, // Per-session current directory
}

impl Default for Lobby {
    fn default() -> Lobby {
        Lobby {
            sessions: HashMap::new(),
            rooms: HashMap::new(),
            curr_dir: HashMap::new(),
        }
    }
}

impl Lobby {
    fn send_message(&self, message: &str, id_to: &Uuid) {
        if let Some(socket_recipient) = self.sessions.get(id_to) {
            let _ = socket_recipient.do_send(WsMessage {
                message: message.to_owned(),
            });
        } else {
            println!("attempting to send message but couldn't find user id: {}", id_to);
        }
    }

    /// Execute command with support for `cd` + timeout
    fn execute_command(&mut self, command: &str, id_to: &Uuid) {
        // Get or initialize current directory for this session
        let curr_dir = self.curr_dir.get(id_to)
            .cloned()
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/")));

        // Handle `cd` separately
        if command.starts_with("cd ") {
            let target_path = command[3..].trim();
            let new_path = if target_path.is_empty() {
                // cd with no arguments goes to home directory
                std::env::var("HOME")
                    .or_else(|_| std::env::var("USERPROFILE"))
                    .unwrap_or_else(|_| "/".to_string()).into()
            } else if target_path == "." {
                // cd . stays in current directory
                curr_dir.clone()
            } else if target_path == ".." {
                // cd .. goes to parent directory
                curr_dir.parent().unwrap_or(&curr_dir).to_path_buf()
            } else if target_path.starts_with('/') || (cfg!(windows) && target_path.len() > 1 && target_path.chars().nth(1) == Some(':')) {
                // Absolute path (Unix or Windows)
                PathBuf::from(target_path)
            } else {
                // Relative path
                curr_dir.join(target_path)
            };
            
            match new_path.canonicalize() {
                Ok(resolved) => {
                    self.curr_dir.insert(id_to.clone(), resolved.clone());
                    let current_path = resolved.to_string_lossy();
                    let response = serde_json::json!({
                        "type": "command_output",
                        "payload": {
                            "command": command,
                            "stdout": "",
                            "stderr": "",
                            "exitCode": 0,
                            "currentDirectory": current_path
                        }
                    });
                    self.send_message(&response.to_string(), id_to);
                }
                Err(e) => {
                    let response = serde_json::json!({
                        "type": "command_output",
                        "payload": {
                            "command": command,
                            "stdout": "",
                            "stderr": format!("cd: \"{}\": {}", target_path, e),
                            "exitCode": 1,
                            "currentDirectory": curr_dir.to_string_lossy()
                        }
                    });
                    self.send_message(&response.to_string(), id_to);
                }
            }
            return;
        }

        // Always include current directory in response
        let current_dir_str = curr_dir.to_string_lossy().to_string();

        // Spawn process (non-blocking)
        let child = if cfg!(target_os = "windows") {
            Command::new("cmd")
                .current_dir(&curr_dir)
                .args(["/C", command])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
        } else {
            Command::new("bash")
                .current_dir(&curr_dir)
                .arg("-c")
                .arg(command)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
        };

        match child {
            Ok(mut process) => {
                let timeout = Duration::from_secs(15);
                match process.wait_timeout(timeout) {
                    Ok(Some(status)) => {
                        match process.wait_with_output() {
                            Ok(output) => {
                                let stdout = String::from_utf8_lossy(&output.stdout);
                                let stderr = String::from_utf8_lossy(&output.stderr);
                                let exit_code = status.code().unwrap_or(-1);

                                let response = serde_json::json!({
                                    "type": "command_output",
                                    "payload": {
                                        "command": command,
                                        "stdout": stdout.trim(),
                                        "stderr": stderr.trim(),
                                        "exitCode": exit_code,
                                        "currentDirectory": current_dir_str
                                    }
                                });
                                
                                self.send_message(&response.to_string(), id_to);
                            }
                            Err(e) => {
                                let response = serde_json::json!({
                                    "type": "command_output",
                                    "payload": {
                                        "command": command,
                                        "stdout": "",
                                        "stderr": format!("Failed to read command output: {}", e),
                                        "exitCode": -1,
                                        "currentDirectory": current_dir_str
                                    }
                                });
                                self.send_message(&response.to_string(), id_to);
                            }
                        }
                    }
                    Ok(None) => {
                        // Timed out → kill process
                        let _ = process.kill();
                        let _ = process.wait();

                        let response = serde_json::json!({
                            "type": "command_output",
                            "payload": {
                                "command": command,
                                "stdout": "",
                                "stderr": format!("Command timed out after {} seconds", timeout.as_secs()),
                                "exitCode": -1,
                                "currentDirectory": current_dir_str
                            }
                        });
                        self.send_message(&response.to_string(), id_to);
                    }
                    Err(e) => {
                        let response = serde_json::json!({
                            "type": "command_output",
                            "payload": {
                                "command": command,
                                "stdout": "",
                                "stderr": format!("Process wait error: {}", e),
                                "exitCode": -1,
                                "currentDirectory": current_dir_str
                            }
                        });
                        self.send_message(&response.to_string(), id_to);
                    }
                }
            }
            Err(e) => {
                let error_response = serde_json::json!({
                    "type": "command_output",
                    "payload": {
                        "command": command,
                        "stdout": "",
                        "stderr": format!("Failed to execute command: {}", e),
                        "exitCode": -1,
                        "currentDirectory": current_dir_str
                    }
                });
                self.send_message(&error_response.to_string(), id_to);
            }
        }
    }
}

impl Actor for Lobby {
    type Context = Context<Self>;
}

impl Handler<Connect> for Lobby {
    type Result = ();

    fn handle(&mut self, msg: Connect, _: &mut Context<Self>) {
        self.rooms
            .entry(msg.lobby_id)
            .or_insert_with(HashSet::new)
            .insert(msg.self_id);

        self.sessions.insert(msg.self_id, msg.addr);

        // Initialize current directory for this session
        let initial_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"));
        self.curr_dir.insert(msg.self_id, initial_dir.clone());

        // Send JSON formatted welcome message with current directory
        let welcome_message = serde_json::json!({
            "type": "system_message",
            "payload": {
                "message": format!("Connected! Your session ID is {}", msg.self_id),
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "currentDirectory": initial_dir.to_string_lossy()
            }
        });
        
        self.send_message(&welcome_message.to_string(), &msg.self_id);
    }
}

impl Handler<Disconnect> for Lobby {
    type Result = ();

    fn handle(&mut self, msg: Disconnect, _: &mut Context<Self>) {
        if self.sessions.remove(&msg.self_id).is_some() {
            // Remove current directory tracking
            self.curr_dir.remove(&msg.self_id);
            
            if let Some(room_users) = self.rooms.get(&msg.lobby_id) {
                room_users
                    .iter()
                    .filter(|conn_id| *conn_id.to_owned() != msg.self_id)
                    .for_each(|user_id| {
                        self.send_message(&format!("{} disconnected.", &msg.self_id), user_id)
                    });
            }

            if let Some(lobby) = self.rooms.get_mut(&msg.lobby_id) {
                if lobby.len() > 1 {
                    lobby.remove(&msg.self_id);
                } else {
                    self.rooms.remove(&msg.lobby_id);
                }
            }
        }
    }
}

impl Handler<ClientActorMessage> for Lobby {
    type Result = ();

    fn handle(&mut self, msg: ClientActorMessage, _: &mut Context<Self>) {
        // Try to parse as JSON command
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&msg.msg) {
            if let Some(msg_type) = parsed["type"].as_str() {
                match msg_type {
                    "command" => {
                        if let Some(command) = parsed["payload"]["command"].as_str() {
                            self.execute_command(command, &msg.id);
                            return;
                        }
                    }
                    "ping" => {
                        // Respond with pong
                        let pong_response = serde_json::json!({
                            "type": "pong",
                            "payload": {
                                "timestamp": chrono::Utc::now().to_rfc3339()
                            }
                        });
                        self.send_message(&pong_response.to_string(), &msg.id);
                        return;
                    }
                    _ => {
                        // Handle other message types or echo back
                        println!("Received message type: {}", msg_type);
                    }
                }
            }
        }

        // Handle legacy whisper and broadcast (keep for compatibility)
        if msg.msg.starts_with("\\w") {
            if let Some(id_to) = msg.msg.split(' ').nth(1) {
                if let Ok(uuid) = Uuid::parse_str(id_to) {
                    self.send_message(&msg.msg, &uuid);
                }
            }
        } else {
            // Broadcast to all users in the room
            if let Some(room_users) = self.rooms.get(&msg.room_id) {
                for client in room_users {
                    self.send_message(&msg.msg, client);
                }
            }
        }
    }
}