use crate::webSocketNeo::WsConn;
use crate::lobby::Lobby;
use actix::Addr;
use actix_web::{get, web, Error, HttpResponse, HttpRequest};
use actix_web_actors::ws;
use uuid::Uuid;

#[get("/ws/{group_id}")]
pub async fn start_connection(
    req: HttpRequest,
    body: web::Payload,
    path: web::Path<String>,
) -> Result<HttpResponse, Error> {
    let group_id = path.into_inner();
    
    // Try to parse as UUID, or generate a new one if invalid
    let group_uuid: Uuid = group_id
        .parse()
        .unwrap_or_else(|_| {
            println!("Invalid UUID '{}', generating new one", group_id);
            Uuid::new_v4()
        });

    let srv: Addr<crate::lobby::Lobby> = req
        .app_data::<web::Data<Addr<crate::lobby::Lobby>>>()
        .map(|d| d.get_ref().clone())
        .ok_or_else(|| actix_web::error::ErrorInternalServerError("Lobby not found"))?;

    let ws = WsConn::new(group_uuid, srv);
    let resp = ws::start(ws, &req, body)?;
    Ok(resp)
}
