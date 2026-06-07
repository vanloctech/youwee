// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let argv: Vec<String> = std::env::args().collect();
    if app_lib::commands::print_cli_usage_and_should_exit(&argv) {
        return;
    }

    app_lib::run();
}
