use actix::prelude::{Message, Recipient};
use uuid::Uuid; // Changed from vvid::Vvid

#[derive(Message)]
#[rtype(result = "()")]
pub struct WsMessage {
    pub message: String, // Changed from tuple struct to named field
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct Connect {
    pub addr: Recipient<WsMessage>,
    pub lobby_id: Uuid,
    pub self_id: Uuid,
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct Disconnect {
    pub lobby_id: Uuid, // Keep consistent naming
    pub self_id: Uuid,  // Keep consistent naming
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct ClientActorMessage {
    pub id: Uuid,
    pub msg: String,
    pub room_id: Uuid,
}

// Add command message type
#[derive(Message)]
#[rtype(result = "()")]
pub struct CommandMessage {
    pub id: Uuid,
    pub command: String,
    pub room_id: Uuid,
}
