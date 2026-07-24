{ pkgs }:
pkgs.stdenvNoCC.mkDerivation {
  pname = "npm-start-nixhost";
  version = "1.0.0";
  src = ./.;

  nativeBuildInputs = [ pkgs.makeWrapper ];
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p "$out/lib/npm-start-nixhost" "$out/bin"
    cp package.json package-lock.json server.js "$out/lib/npm-start-nixhost/"

    makeWrapper ${pkgs.nodejs_24}/bin/npm "$out/bin/npm-start-nixhost" \
      --chdir "$out/lib/npm-start-nixhost" \
      --add-flags "run start"

    runHook postInstall
  '';
}
