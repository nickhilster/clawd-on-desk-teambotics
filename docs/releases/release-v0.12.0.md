## v0.12.0

v0.12.0 completes the DeskBuddy rebrand and adds live MDown Manager
integration for the MDM pet theme.

### New Features

- **MDown Manager live activity** (#4) - The MDown Manager pet theme now reflects real MDown Manager activity instead of shipping as a static skin. A new poller (`agents/mdown-manager-poller.js`) polls MDown Manager's local HTTP API and drives the pet's existing idle/sweeping/thinking/working/error states from idle/scanning/summarizing/embedding/error, only emitting on transitions. Registered as a state-only, poller-based agent with its own Settings tab (enable toggle, base URL, password-masked API key) that takes effect without a restart.

### Rebrand

- **Full Clawd → DeskBuddy rebrand** (#6) - Completes the product rename started in earlier releases: plugin/extension package metadata, README locales, tray tooltip, window/PWA titles, updater messages and User-Agent, installer exe-name checks, setup docs, and diagnostic log prefixes. Also fixes an Android deep-link scheme mismatch (`clawd://` vs `deskbuddy://`) introduced mid-rebrand between the manifest and connection-parsing code. The on-screen pet character keeps the name "Clawd" as one of the built-in themes (alongside Calico and Cloudling) — only the product/app identity changed. Legacy migration constants and detection markers are intentionally left in place so upgrades from old "Clawd on Desk" installs keep working.
