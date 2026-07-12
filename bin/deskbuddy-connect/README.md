deskbuddy-connect sidecar binaries
=================================

Electron packaged builds copy this directory to:

  resources/sidecars/deskbuddy-connect/

Place built sidecar binaries in platform/architecture directories:

  windows-x64/deskbuddy-connect.exe
  windows-arm64/deskbuddy-connect.exe
  darwin-x64/deskbuddy-connect
  darwin-arm64/deskbuddy-connect
  linux-x64/deskbuddy-connect
  linux-arm64/deskbuddy-connect

DeskBuddy release builds fetch the pinned public fork release with:

  npm run fetch:sidecars

Source checkouts run a lightweight preflight before `npm start`. It downloads
the current platform's pinned sidecar when missing, verifies the downloaded
archive and extracted binary against SHA256 values pinned in
`scripts/fetch-sidecar-binaries.js`, and then continues launching DeskBuddy. To skip that network preflight, set
`DESKBUDDY_SKIP_SIDECAR_FETCH=1`. Setting `DESKBUDDY_DESKBUDDY_CONNECT_PATH` to an
existing executable or containing directory also skips the preflight fetch.

The fetch script downloads release archives from
`rullerzhou-afk/deskbuddy-connect`, verifies the source-pinned checksums, and
extracts the binaries into this directory layout. Do not use upstream latest
artifacts.

Upstream `chenhg5/cc-connect` updates are not consumed automatically. To update
the sidecar dependency, sync the public `deskbuddy-connect` fork from upstream,
review and test the DeskBuddy bridge changes, publish a new fixed sidecar release
tag such as `deskbuddy-sidecar-v0.1.1`, then update the pinned tag in
`scripts/fetch-sidecar-binaries.js` and run the sidecar fetch/verify tests.

The resolver uses Go-style OS names (`windows`, `darwin`, `linux`) and
Electron/Node architecture names (`x64`, `arm64`). Source runs use this same
layout under the repo-local `bin/deskbuddy-connect/` directory.

For development, `DESKBUDDY_DESKBUDDY_CONNECT_PATH` takes precedence. It may point
directly to a sidecar executable, or to a directory containing
`deskbuddy-connect` / `deskbuddy-connect.exe`.
