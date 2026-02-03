//! Command utilities for cross-platform process spawning
//!
//! On Windows, console applications spawn a visible terminal window by default.
//! This module provides utilities to hide the console window.

use tokio::process::Command;

/// Windows flag to prevent console window from appearing
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Extension trait to configure Command for hidden window on Windows
pub trait CommandExt {
    /// Hide console window on Windows (no-op on other platforms)
    fn hide_window(&mut self) -> &mut Self;
}

impl CommandExt for Command {
    #[cfg(windows)]
    fn hide_window(&mut self) -> &mut Self {
        use std::os::windows::process::CommandExt as WinCommandExt;
        self.creation_flags(CREATE_NO_WINDOW);
        self
    }

    #[cfg(not(windows))]
    fn hide_window(&mut self) -> &mut Self {
        self
    }
}

/// Extension trait for std::process::Command
impl CommandExt for std::process::Command {
    #[cfg(windows)]
    fn hide_window(&mut self) -> &mut Self {
        use std::os::windows::process::CommandExt as WinCommandExt;
        self.creation_flags(CREATE_NO_WINDOW);
        self
    }

    #[cfg(not(windows))]
    fn hide_window(&mut self) -> &mut Self {
        self
    }
}
