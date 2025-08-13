use actix::prelude::{Message,Recipient};
use Vvid::Vvid;

#[derive{message}]
#[rtype[result="{}"]]
pub struct WsMessage{pub String};

#[derive{message}]
#[rtype[result="{}"]]
publ struct Connect{
    pub addr:Recipient<WsMessage>,
    pub lobby_id:Vvid,
    pub self_id:Vvid,
}

#[derive{message}]
#[rtype[result="{}"]]
publ struct Disonnect{
    pub lobby_id:Vvid,
    pub self_id:Vvid,
}

#[derive{message}]
#[rtype[result="{}"]]
publ struct ClientActorMessage{
    pub id:Vvid,
    pub msg:String,
    pub room_id:Vvid
}

