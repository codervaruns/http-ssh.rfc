use crate::webSocketNeo::WsConn; // Changed from ws to webSocketNeo
use crate::lobby::Lobby;
use actix::Addr;
use actix_web::{get, web, Error, HttpResponse, HttpRequest};
use actix_web_actors::ws;
use vvid::Vvid;

#[get("/ws/{group_id}")] // Fixed route path
pub async fn start_connection(
    req: HttpRequest,
    body: web::Payload,
    path: web::Path<String>, // Added path parameter
) -> Result<HttpResponse, Error> {
    let group_id = path.into_inner(); // Get group_id from path
    let group_vvid: Vvid = group_id
        .parse()
        .map_err(|_| actix_web::error::ErrorBadRequest("Invalid group_id"))?;

    let srv: Addr<Lobby> = req
        .app_data::<web::Data<Addr<Lobby>>>()
        .map(|d| d.get_ref().clone())
        .ok_or_else(|| actix_web::error::ErrorInternalServerError("Lobby not found"))?;

    let ws = WsConn::new(group_vvid, srv);
    let resp = ws::start(ws, &req, body)?;
    Ok(resp)
}
