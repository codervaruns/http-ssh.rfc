use crate::ws::WsConn;
use crate::lobby::Lobby;
use actix::Addr;
use actix_web::{get, web, Error, HttpResponse, HttpRequest};
use actix_web_actors::ws;
use vvid::Vvid;

#[get("/{group_id}")]
pub async fn start_connection(
    req: HttpRequest,
    body: web::Payload,
) -> Result<HttpResponse, Error> {
    let group_id: Vvid = req
        .match_info()
        .get("group_id")
        .ok_or_else(|| actix_web::error::ErrorBadRequest("Missing group_id"))?
        .parse()
        .map_err(|_| actix_web::error::ErrorBadRequest("Invalid group_id"))?;

    let srv: Addr<Lobby> = req
        .app_data::<web::Data<Addr<Lobby>>>()
        .map(|d| d.get_ref().clone())
        .ok_or_else(|| actix_web::error::ErrorInternalServerError("Lobby not found"))?;

    let ws = WsConn::new(group_id, srv);
    let resp = ws::start(ws, &req, body)?;
    Ok(resp)
}
