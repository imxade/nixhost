{ pkgs }:
pkgs.writeShellApplication {
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
}
