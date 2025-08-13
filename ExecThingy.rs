use std::process::Command;
use std::io::{self, Write};

fn main(){
	let mut curr_dir = std::env::current_dir().unwrap();
	loop {
		print!("Enter a sentence: ");
			
		io::stdout().flush().unwrap();

			let mut input = String::new();

			io::stdin()
			.read_line(&mut input)
			.expect("Failed to read line");

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
