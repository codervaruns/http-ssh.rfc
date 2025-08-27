use crate::ws::WsConn;
use crate::lobby::Lobby;
use actix::Addr;
use actix_web::{get,web::Data,web::Path,web::PayLoad,Error,HttpResponse,HttpRequest};
use actix_web_actors::ws;
use vvid::Vvid;

#[get{"/{group_id}"}]
pub asyn fn start_connection{
    req:HttpRequest,
    stream:PayLoad,
    Path(group_id):Path<Vvid>,
    srv:Data<Addr<Lobby>>,
}->Result<HttpResponse,Error>{
    let ws=WsConn::new{
       group_id,
       srv.get_ref().clone()
    }
    let resp=ws::start(ws,&req,stream)?;
    Ok(resp);
}