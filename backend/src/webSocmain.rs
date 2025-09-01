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

// Add file listing endpoint for file explorer
async fn list_directory(path: web::Path<String>) -> Result<HttpResponse> {
    use std::fs;
    
    let dir_path = path.into_inner();
    let safe_path = if dir_path.starts_with('/') { 
        dir_path 
    } else { 
        format!("/{}", dir_path) 
    };
    
    match fs::read_dir(&safe_path) {
        Ok(entries) => {
            let mut files = Vec::new();
            for entry in entries {
                if let Ok(entry) = entry {
                    let metadata = entry.metadata().ok();
                    let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
                    let permissions = if cfg!(unix) {
                        #[cfg(unix)]
                        {
                            use std::os::unix::fs::PermissionsExt;
                            metadata.as_ref()
                                .map(|m| format!("{:o}", m.permissions().mode()))
                                .unwrap_or_else(|| "???".to_string())
                        }
                        #[cfg(not(unix))]
                        "???".to_string()
                    } else {
                        "rwx".to_string()
                    };
                    
                    files.push(serde_json::json!({
                        "name": entry.file_name().to_string_lossy(),
                        "is_directory": is_dir,
                        "permissions": permissions,
                        "path": entry.path().to_string_lossy()
                    }));
                }
            }
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "files": files,
                "current_path": safe_path
            })))
        }
        Err(e) => {
            Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": format!("Failed to read directory: {}", e)
            })))
        }
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();
    
    let chat_server = Lobby::default().start();

    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .route("/health", web::get().to(health_check))
            .route("/api/files/{path:.*}", web::get().to(list_directory))
            .service(start_connection_route)
            .app_data(web::Data::new(chat_server.clone()))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}
