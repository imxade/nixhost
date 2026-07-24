{
  description = "Minimal NixHost web application";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-linux" "x86_64-linux" "aarch64-darwin" "x86_64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      packages = forAllSystems (system:
        let pkgs = import nixpkgs { inherit system; };
        in {
          default = pkgs.writeShellApplication {
            name = "hello-nixhost";
            runtimeInputs = [ pkgs.python3 ];
            text = ''
              : "''${HOST:=127.0.0.1}"
              : "''${PORT:?NixHost must provide PORT}"
              mkdir -p "''${DATA_DIR:?NixHost must provide DATA_DIR}"
              cat > "$DATA_DIR/index.html" <<HTML
              <!doctype html><html><head><meta charset="utf-8"><title>Hello NixHost</title></head>
              <body><h1>Hello from NixHost</h1><p>Deployment: ''${DEPLOYMENT_ID:-unknown}</p></body></html>
              HTML
              cd "$DATA_DIR"
              exec python -m http.server "$PORT" --bind "$HOST"
            '';
          };
        });
      apps = forAllSystems (system: {
        default = { type = "app"; program = "${self.packages.${system}.default}/bin/hello-nixhost"; };
      });
    };
}
