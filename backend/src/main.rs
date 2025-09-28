mod lobby;
mod webSocketNeo;
mod message;
mod startConn;

use lobby::Lobby;
use actix::Actor;
use startConn::start_connection as start_connection_route;
use actix_web::{App, HttpServer, middleware::Logger, web, HttpResponse, Result, middleware::DefaultHeaders};

// Add health check endpoint
async fn health_check() -> Result<HttpResponse> {
    Ok(HttpResponse::Ok()
        .insert_header(("Access-Control-Allow-Origin", "*"))
        .insert_header(("Access-Control-Allow-Methods", "GET, POST, OPTIONS"))
        .insert_header(("Access-Control-Allow-Headers", "Content-Type"))
        .json(serde_json::json!({
            "status": "healthy",
            "service": "http-ssh-server",
            "timestamp": chrono::Utc::now().timestamp(),
            "websocket_available": true,
            "websocket_endpoint": "/ws/{room_id}"
        })))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();
    
    println!("Starting HTTP-SSH Server on 127.0.0.1:8080");
    println!("Health check endpoint: http://127.0.0.1:8080/health");
    println!("WebSocket endpoint: ws://127.0.0.1:8080/ws/{{room_id}}");
    
    let chat_server = Lobby::default().start();

    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .wrap(
                DefaultHeaders::new()
                    .add(("Access-Control-Allow-Origin", "*"))
                    .add(("Access-Control-Allow-Methods", "GET, POST, OPTIONS"))
                    .add(("Access-Control-Allow-Headers", "Content-Type"))
            )
            .route("/health", web::get().to(health_check))
            .service(start_connection_route)
            .app_data(web::Data::new(chat_server.clone()))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}
