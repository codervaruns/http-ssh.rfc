mod lobby;
mod ws;
mod messages;
mod start_connection;

use lobby::Lobby;
use actix::Actor;
use start_connection::start_connection as start_connection_route;

use actix_web::{App, HttpServer};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let chat_server = Lobby::default().start();

    HttpServer::new(move || {
        App::new()
            .service(start_connection_route)
            .app_data(actix_web::web::Data::new(chat_server.clone()))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}
