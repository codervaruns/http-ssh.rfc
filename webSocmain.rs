mod lobby;
mod webSocketNeo;
mod message;
mod startConn; // Changed from 'start_connection' to 'startConn'

use lobby::Lobby;
use actix::Actor;
use startConn::start_connection as start_connection_route; // Changed module name
use actix_web::{App, HttpServer, middleware::Logger};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();
    
    let chat_server = Lobby::default().start();

    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .service(start_connection_route)
            .app_data(actix_web::web::Data::new(chat_server.clone()))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}
