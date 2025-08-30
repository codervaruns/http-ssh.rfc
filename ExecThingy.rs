use std::process::{Command, Stdio};
use std::io::{self, Write};
use std::path::PathBuf;
use std::time::Duration;
use axum::{
    extract::Json as ExtractJson,
    Json,
};
use serde::{Deserialize, Serialize};
use tokio::time::timeout;
use wait_timeout::ChildExt;

#[derive(Deserialize)]
struct Input{
	input: String,
}

#[derive(Serialize)]
struct Output{
	stdout: String,
	stderr: String,
	status: i32,
}

struct CD{
	curr_dir: PathBuf,
}

impl CD{
    fn new() -> Self {
        Self {
            curr_dir: std::env::current_dir().unwrap(),
        }
    }

	pub async fn cd(&mut self,ExtractJson(payload): ExtractJson<Input>) -> Json<Output> {
		let sentence = payload.input;

		// Handle cd command
		if sentence.starts_with("cd ") {
			let new_path = self.curr_dir.join(sentence[3..].trim());
			match new_path.canonicalize() {
				Ok(resolved) => {
					self.curr_dir = resolved;
					return Json(Output {
						stdout: "".to_string(),
						stderr: "".to_string(),
						status: 0,
					});
				}
				Err(e) => {
					return Json(Output {
						stdout: "".to_string(),
						stderr: format!("cd failed: {}", e),
						status: 1,
					});
				}
			}
		}

		// Execute command with timeout
		let cmd_future = async {
			let mut child = if cfg!(target_os = "windows") {
				Command::new("cmd")
					.current_dir(self.curr_dir.clone())
					.args(["/C", &sentence])
					.stdout(Stdio::piped())
					.stderr(Stdio::piped())
					.spawn()
			} else {
				Command::new("bash")
					.current_dir(self.curr_dir.clone())
					.arg("-c")
					.arg(&sentence)
					.stdout(Stdio::piped())
					.stderr(Stdio::piped())
					.spawn()
			};

			match child {
				Ok(mut process) => {
					let timeout_duration = Duration::from_secs(10); // 10 second timeout
					match process.wait_timeout(timeout_duration) {
						Ok(Some(status)) => {
							// Process completed within timeout
							let output = process.wait_with_output().unwrap();
							Output {
								stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
								stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
								status: status.code().unwrap_or(-1),
							}
						}
						Ok(None) => {
							// Process timed out
							let _ = process.kill();
							let _ = process.wait();
							Output {
								stdout: "".to_string(),
								stderr: format!("Command timed out after {} seconds", timeout_duration.as_secs()),
								status: -1,
							}
						}
						Err(e) => {
							Output {
								stdout: "".to_string(),
								stderr: format!("Error waiting for process: {}", e),
								status: -1,
							}
						}
					}
				}
				Err(e) => {
					Output {
						stdout: "".to_string(),
						stderr: format!("Failed to execute command: {}", e),
						status: -1,
					}
				}
			}
		};

		// Apply async timeout as additional safety
		match timeout(Duration::from_secs(15), cmd_future).await {
			Ok(output) => Json(output),
			Err(_) => Json(Output {
				stdout: "".to_string(),
				stderr: "Command execution timed out".to_string(),
				status: -1,
			})
		}
    }
}

#[tokio::main]
async fn main() {
    let mut cd = CD::new();

    loop {
        print!("$ "); // shell-like prompt
        io::stdout().flush().unwrap();

        let mut input = String::new();
        io::stdin().read_line(&mut input).expect("Failed to read line");

        let input = input.trim().to_string();

        // Exit condition
        if input == "exit" || input == "quit" {
            break;
        }

        let payload = Input { input };

        // Call cd function
        let output = cd.cd(axum::extract::Json(payload)).await;

        // Print output
        println!("stdout: {}", output.0.stdout);
        println!("stderr: {}", output.0.stderr);
        println!("status: {}", output.0.status);
    }
}


/*
fn main(){
	let mut curr_dir = std::env::current_dir().unwrap();
	loop {
		print!("Enter a sentence: ");
			
		io::stdout().flush().unwrap();

		let mut input = String::new();

		io::stdin().read_line(&mut input).expect("Failed to read line");

		let sentence = input.trim();

		if sentence.starts_with("cd "){
			curr_dir = curr_dir.join(sentence[3..].trim());
			curr_dir = curr_dir.canonicalize().unwrap();
		}

		let output = Command::new("bash").current_dir(curr_dir.clone()).arg("-c").arg(sentence).output().expect("Failed");

		let stdout = String::from_utf8_lossy(&output.stdout);
		
		let mut result = stdout.trim().to_string();

		println!("{}",result);

		let stderr = String::from_utf8_lossy(&output.stderr);

		result = stderr.trim().to_string();

		println!("{}",result);

		let exitcode = &output.status.code();

		if let Some(temp) = exitcode{
			println!("{}",temp);
		}
	}
}

*/