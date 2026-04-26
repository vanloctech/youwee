{
  description = "Youwee — Modern video downloader built with Tauri 2 and React 19";

  inputs = {
    konductor.url = "github:braincraftio/konductor";
    nixpkgs.follows = "konductor/nixpkgs";
    flake-utils.follows = "konductor/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, konductor, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };

        youweePackages = with pkgs; [
          yt-dlp   # Video extraction — resolved via system PATH (source=Auto)
          ffmpeg   # Post-processing: merge, transcode, embed metadata/subs
          deno     # JavaScript runtime for yt-dlp YouTube extraction (--js-runtimes)
          gallery-dl       # Gallery/collection downloads — resolved via system PATH
          glib-networking  # GnuTLS backend for GIO — required by WebKitGTK for HTTPS
        ];

      in {
        devShells.default = pkgs.mkShell {
          name = "youwee";
          packages = youweePackages;
          inputsFrom = [ konductor.devShells.${system}.frontend ];

          env = {
            KONDUCTOR_SHELL = "youwee";
            GIO_EXTRA_MODULES = "${pkgs.glib-networking}/lib/gio/modules:${pkgs.dconf.lib}/lib/gio/modules";
          };
        };
      }
    );
}
