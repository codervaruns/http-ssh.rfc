use actix::{fut, Actor, ActorContext, ActorFutureExt, Addr, Running, StreamHandler, Handler};
use actix_web_actors::ws;
use actix_web_actors::ws::Message::Text;
use std::time::{Duration, Instant};
use vvid::Vvid;

use crate::lobby::Lobby;
use crate::message::{Connect, Disconnect, ClientActorMessage, WsMessage}; // Changed from 'messages' to 'message'

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);
const CLIENT_TIMEOUT: Duration = Duration::from_secs(10);

pub struct WsConn {
    room: Vvid,
    lobby_addr: Addr<Lobby>,
    hb: Instant,
    id: Vvid,
}

impl WsConn {
    pub fn new(room: Vvid, lobby: Addr<Lobby>) -> WsConn {
        WsConn {
            id: Vvid::new_vd(),
            room,
            hb: Instant::now(),
            lobby_addr: lobby,
        }
    }
}

impl Actor for WsConn {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        self.hb(ctx);

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
            self_id: self.id,   // Changed from 'id' to 'self_id'
            lobby_id: self.room, // Changed from 'room_id' to 'lobby_id'
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
                    self_id: act.id,    // Changed from 'id' to 'self_id'
                    lobby_id: act.room, // Changed from 'room_id' to 'lobby_id'
                });
                ctx.stop();
                return;
            }
            ctx.ping(b"PING");
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
                ctx.pong(&msg);
            }
            Ok(ws::Message::Pong(_)) => {
                self.hb = Instant::now();
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
            Ok(Text(s)) => self.lobby_addr.do_send(ClientActorMessage {
                id: self.id,
                msg: s,
                room_id: self.room,
            }),
            Err(e) => panic!("{:?}", e),
        }
    }
}

impl Handler<WsMessage> for WsConn {
    type Result = ();

    fn handle(&mut self, msg: WsMessage, ctx: &mut Self::Context) {
        ctx.text(msg.message); // Changed from msg.0 to msg.message
    }
}
