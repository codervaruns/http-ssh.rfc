use std::process::Command;
use std::io::{self, Write};

fn main(){
	loop {
		print!("Enter a sentence: ");
			
		io::stdout().flush().unwrap();

			let mut input = String::new();

			io::stdin()
			.read_line(&mut input)
			.expect("Failed to read line");

		let sentence = input.trim();

		let output = Command::new("bash").arg("-c").arg(sentence).output().expect("Failed");

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
