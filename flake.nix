{
  description = "NixHost — LAN-first Next.js control plane for Nix flake applications";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-linux" "x86_64-linux" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          basePackages = with pkgs; [
            nodejs_24
            pnpm_10
            git
            cloudflared
            python3
            pkg-config
            sqlite
            gnutar
          ];
          mkNixHostShell = packages: pkgs.mkShell {
            inherit packages;
            shellHook = ''
              export NIXHOST_DATA_DIR="''${NIXHOST_DATA_DIR:-$PWD/.local-data}"
              echo "NixHost development shell (${system})"
              echo "Run: pnpm install && pnpm dev"
            '';
          };
        in {
          default = mkNixHostShell basePackages;
          android = mkNixHostShell (basePackages ++ (with pkgs; [
            android-tools
            curl
            jdk21_headless
            maestro
            yq-go
          ]));
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
