use actix::{fut, Actor, ActorContext, ActorFutureExt, Addr, Running, StreamHandler, Handler, AsyncContext, WrapFuture, ContextFutureSpawner};
use actix_web_actors::ws;
use actix_web_actors::ws::Message::Text;
use std::time::{Duration, Instant};
use uuid::Uuid;

use crate::lobby::Lobby;
use crate::message::{Connect, Disconnect, ClientActorMessage, WsMessage};

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);
const CLIENT_TIMEOUT: Duration = Duration::from_secs(10);
const PING_INTERVAL: Duration = Duration::from_secs(30); // Send ping every 30 seconds

pub struct WsConn {
    room: Uuid,
    lobby_addr: Addr<Lobby>,
    hb: Instant,
    id: Uuid,
    last_ping: Instant, // Track when we last sent a ping
}

impl WsConn {
    pub fn new(room: Uuid, lobby: Addr<Lobby>) -> WsConn {
        WsConn {
            id: Uuid::new_v4(),
            room,
            hb: Instant::now(),
            lobby_addr: lobby,
            last_ping: Instant::now(),
        }
    }
}

impl Actor for WsConn {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        self.hb(ctx);
        self.start_ping_task(ctx); // Start the ping task

        let addr = ctx.address();
        self.lobby_addr
            .send(Connect {
                addr: addr.recipient(),
                lobby_id: self.room,
                self_id: self.id,
            })
            .into_actor(self)
            .then(|res, _, ctx| {
                match res {
                    Ok(_res) => (),
                    _ => ctx.stop(),
                }
                fut::ready(())
            })
            .wait(ctx);
    }

    fn stopping(&mut self, _: &mut Self::Context) -> Running {
        self.lobby_addr.do_send(Disconnect {
            self_id: self.id,
            lobby_id: self.room,
        });
        Running::Stop
    }
}

impl WsConn {
    fn hb(&self, ctx: &mut ws::WebsocketContext<Self>) {
        ctx.run_interval(HEARTBEAT_INTERVAL, |act, ctx| {
            if Instant::now().duration_since(act.hb) > CLIENT_TIMEOUT {
                println!("disconnecting due to heartbeat");
                act.lobby_addr.do_send(Disconnect {
                    self_id: act.id,
                    lobby_id: act.room,
                });
                ctx.stop();
                return;
            }
            ctx.ping(b"PING");
        });
    }

    // New ping task to send periodic pings to keep connection alive
    fn start_ping_task(&self, ctx: &mut ws::WebsocketContext<Self>) {
        ctx.run_interval(PING_INTERVAL, |act, ctx| {
            println!("Sending keepalive ping to client {}", act.id);
            
            // Send a JSON ping message that the client can recognize
            let ping_message = serde_json::json!({
                "type": "ping",
                "timestamp": chrono::Utc::now().timestamp(),
                "server_id": "http-ssh-server"
            });
            
            ctx.text(ping_message.to_string());
            act.last_ping = Instant::now();
        });
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WsConn {
    fn handle(
        &mut self,
        msg: Result<ws::Message, ws::ProtocolError>,
        ctx: &mut Self::Context,
    ) {
        match msg {
            Ok(ws::Message::Ping(msg)) => {
                self.hb = Instant::now();
                println!("Received ping from client, sending pong");
                ctx.pong(&msg);
            }
            Ok(ws::Message::Pong(_)) => {
                self.hb = Instant::now();
                println!("Received pong from client");
            }
            Ok(ws::Message::Binary(bin)) => ctx.binary(bin),
            Ok(ws::Message::Close(reason)) => {
                ctx.close(reason);
                ctx.stop();
            }
            Ok(ws::Message::Continuation(_)) => {
                ctx.stop();
            }
            Ok(ws::Message::Nop) => {}
            Ok(Text(s)) => {
                // Handle JSON ping/pong messages
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&s) {
                    if let Some(msg_type) = parsed.get("type").and_then(|t| t.as_str()) {
                        match msg_type {
                            "pong" => {
                                println!("Received JSON pong from client {}", self.id);
                                self.hb = Instant::now();
                                return;
                            }
                            "ping" => {
                                println!("Received JSON ping from client {}, sending pong", self.id);
                                let pong_message = serde_json::json!({
                                    "type": "pong",
                                    "timestamp": chrono::Utc::now().timestamp(),
                                    "server_id": "http-ssh-server"
                                });
                                ctx.text(pong_message.to_string());
                                self.hb = Instant::now();
                                return;
                            }
                            _ => {
                                // Handle other message types normally
                                self.lobby_addr.do_send(ClientActorMessage {
                                    id: self.id,
                                    msg: s.to_string(),
                                    room_id: self.room,
                                });
                            }
                        }
                    } else {
                        // Not a recognized JSON message, forward to lobby
                        self.lobby_addr.do_send(ClientActorMessage {
                            id: self.id,
                            msg: s.to_string(),
                            room_id: self.room,
                        });
                    }
                } else {
                    // Not JSON, forward to lobby
                    self.lobby_addr.do_send(ClientActorMessage {
                        id: self.id,
                        msg: s.to_string(),
                        room_id: self.room,
                    });
                }
            }
            Err(e) => {
                eprintln!("WebSocket protocol error: {:?}", e);
                ctx.stop();
            }
        }
    }
}

impl Handler<WsMessage> for WsConn {
    type Result = ();

    fn handle(&mut self, msg: WsMessage, ctx: &mut Self::Context) {
        ctx.text(msg.message);
    }
}
