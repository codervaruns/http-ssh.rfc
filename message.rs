use actix::prelude::{Message, Recipient};
use vvid::Vvid; // Changed from uuid::Uuid

#[derive(Message)]
#[rtype(result = "()")]
pub struct WsMessage {
    pub message: String, // Changed from tuple struct to named field
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct Connect {
    pub addr: Recipient<WsMessage>,
    pub lobby_id: Vvid,
    pub self_id: Vvid,
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct Disconnect {
    pub lobby_id: Vvid, // Keep consistent naming
    pub self_id: Vvid,  // Keep consistent naming
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct ClientActorMessage {
    pub id: Vvid,
    pub msg: String,
    pub room_id: Vvid,
}

// Add command message type
#[derive(Message)]
#[rtype(result = "()")]
pub struct CommandMessage {
    pub id: Vvid,
    pub command: String,
    pub room_id: Vvid,
}
