use crate::message::{ClientActorMessage, Connect, Disconnect, WsMessage, CommandMessage}; // Changed from 'messages' to 'message'
use actix::prelude::{Actor, Context, Handler, Recipient};
use std::collections::{HashMap, HashSet};
use std::process::Command;
use vvid::Vvid;
use serde_json;

type Socket = Recipient<WsMessage>;

pub struct Lobby {
    sessions: HashMap<Vvid, Socket>,
    rooms: HashMap<Vvid, HashSet<Vvid>>,
}

impl Default for Lobby {
    fn default() -> Lobby {
        Lobby {
            sessions: HashMap::new(),
            rooms: HashMap::new(),
        }
    }
}

impl Lobby {
    fn send_message(&self, message: &str, id_to: &Vvid) {
        if let Some(socket_recipient) = self.sessions.get(id_to) {
            let _ = socket_recipient.do_send(WsMessage {
                message: message.to_owned(),
            });
        } else {
            println!("attempting to send message but couldn't find user id");
        }
    }

    // Add command execution function
    fn execute_command(&self, command: &str, id_to: &Vvid) {
        let output = Command::new("bash")
            .arg("-c")
            .arg(command)
            .output();

        match output {
            Ok(result) => {
                let stdout = String::from_utf8_lossy(&result.stdout);
                let stderr = String::from_utf8_lossy(&result.stderr);
                let exit_code = result.status.code().unwrap_or(-1);

                let response = serde_json::json!({
                    "type": "command_output",
                    "payload": {
                        "command": command,
                        "stdout": stdout.trim(),
                        "stderr": stderr.trim(),
                        "exitCode": exit_code
                    }
                });

                self.send_message(&response.to_string(), id_to);
            }
            Err(e) => {
                let error_response = serde_json::json!({
                    "type": "command_output",
                    "payload": {
                        "command": command,
                        "stdout": "",
                        "stderr": format!("Failed to execute command: {}", e),
                        "exitCode": -1
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

impl Handler<Disconnect> for Lobby {
    type Result = ();

    fn handle(&mut self, msg: Disconnect, _: &mut Context<Self>) {
        if self.sessions.remove(&msg.self_id).is_some() {
            self.rooms
                .get(&msg.lobby_id)
                .unwrap()
                .iter()
                .filter(|conn_id| *conn_id.to_owned() != msg.self_id)
                .for_each(|user_id| {
                    self.send_message(&format!("{} disconnected.", &msg.self_id), user_id)
                });

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

impl Handler<Connect> for Lobby {
    type Result = ();

    fn handle(&mut self, msg: Connect, _: &mut Context<Self>) {
        self.rooms
            .entry(msg.lobby_id)
            .or_insert_with(HashSet::new)
            .insert(msg.self_id);

        self.rooms
            .get(&msg.lobby_id)
            .unwrap()
            .iter()
            .for_each(|conn_id| {
                self.send_message(&format!("{} just joined!", msg.self_id), conn_id)
            });

        self.sessions.insert(msg.self_id, msg.addr);

        self.send_message(&format!("your id is {}", msg.self_id), &msg.self_id);
    }
}

impl Handler<ClientActorMessage> for Lobby {
    type Result = ();

    fn handle(&mut self, msg: ClientActorMessage, _: &mut Context<Self>) {
        // Try to parse as JSON command
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&msg.msg) {
            if let Some(msg_type) = parsed["type"].as_str() {
                if msg_type == "command" {
                    if let Some(command) = parsed["payload"]["command"].as_str() {
                        self.execute_command(command, &msg.id);
                        return;
                    }
                }
            }
        }

        // Handle whisper and broadcast as before
        if msg.msg.starts_with("\\w") {
            if let Some(id_to) = msg.msg.split(' ').nth(1) {
                self.send_message(
                    &msg.msg,
                    &Vvid::parse_str(id_to).unwrap(),
                );
            }
        } else {
            self.rooms
                .get(&msg.room_id)
                .unwrap()
                .iter()
                .for_each(|client| self.send_message(&msg.msg, client));
        }
    }
}
