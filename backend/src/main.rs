mod lobby;
mod webSocketNeo;
mod message;
mod startConn;

use lobby::Lobby;
use actix::Actor;
use startConn::start_connection as start_connection_route;
use actix_web::{App, HttpServer, middleware::Logger, web, HttpResponse, Result};

// Add health check endpoint
async fn health_check() -> Result<HttpResponse> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "http-ssh-server",
        "timestamp": chrono::Utc::now().timestamp(),
        "websocket_available": true
    })))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();
    
    let chat_server = Lobby::default().start();

    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .route("/health", web::get().to(health_check))
            .service(start_connection_route)
            .app_data(web::Data::new(chat_server.clone()))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}
