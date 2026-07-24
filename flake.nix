{
  description = "NixHost — LAN-first Next.js control plane for Nix flake applications";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-linux" "x86_64-linux" "aarch64-darwin" "x86_64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let pkgs = import nixpkgs { inherit system; };
        in {
          default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs_24
              pnpm_10
              git
              cloudflared
              python3
              pkg-config
              sqlite
              gnutar
            ];
            shellHook = ''
              export NIXHOST_DATA_DIR="''${NIXHOST_DATA_DIR:-$PWD/.local-data}"
              echo "NixHost development shell (${system})"
              echo "Run: pnpm install && pnpm dev"
            '';
          };
        });

      packages = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in {
          default = import ./nixhost.nix {
            inherit pkgs self systems;
          };
        });

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/nixhost";
        };
      });
    };
}
