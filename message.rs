use actix::prelude::{Message, Recipient};
use uuid::Uuid as Vvid; // Assuming Vvid is just Uuid, change if you have your own type

#[derive(Message)]
#[rtype(result = "()")]
pub struct WsMessage(pub String);

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
    pub lobby_id: Vvid,
    pub self_id: Vvid,
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct ClientActorMessage {
    pub id: Vvid,
    pub msg: String,
    pub room_id: Vvid,
}
