---
name: BetterScrobbler
summary: A Last.fm scrobbler for macOS that logs playback from any source. Written first in C++/Objective-C++, later rewritten in Go.
---

- **System-wide capture**: macOS has no reliable system-wide scrobbler — Apple Music has none built in and the old plugin approach is deprecated — so this reads the operating system's now-playing state directly. Spotify, Apple Music, YouTube and browsers are all captured, with parser rules skipping anything that is not music
- **Calling a private framework**: that state is only available from Apple's undocumented MediaRemote framework. The C++ version declares its private interfaces in Objective-C++ and links it through CMake with `-F/System/Library/PrivateFrameworks`; the Go version bridges through CGo, which means marshalling types on both sides of the C boundary
- **Deciding what counts**: not every play should be logged, so the engine splits into stream, track and scrobble managers plus a timer, and the timer applies Last.fm's rule for when a play becomes a scrobble
- **Filling the gaps**: sources MediaRemote does not cover are picked up through AppleScript and browser audio detection
- **Request signing**: Last.fm requires signed requests, implemented by hand — sort the parameters, append the secret, take the md5
- **Credential storage**: authentication details go into the macOS Keychain
- **Terminal interface**: a Bubble Tea UI with synchronized LRC lyrics, and a background daemon mode
