# Trurpchat

<p align="center">
  <a href="README.md">English</a> · <a href="README_RU.md">Русский</a>
</p>

<p align="center">
  <strong><a href="https://github.com/lolotronop/trurpchat/releases">download</a></strong>
  ·
  <strong><a href="#run-with-docker">run</a></strong>
</p>

Trurpchat is a true and simple chat app for Windows that is meant to be easy to self-host.

I got frustrated with the existing options and decided to bite the bullet and write one myself with Tauri, Svelte, and Rust for streaming.

Current features include:

- Voice chat
- High-quality screen sharing
- Camera feeds
- Keybinds
- Audio processing with a gate, gain, and compressor
- Text chat
- Roles and permissions
- Custom themes

Planned features:

- Image/file upload support
- Avatars

## Current status

Trurpchat development is currently in alpha state and is on pause for some time. I'm using it personally with my friend group, but there are a lot of rough edges to iron out for the future.

The backend can be run locally with Bun, or with Docker. For media streaming, Trurpchat uses [OvenMediaEngine](https://ovenmedialabs.com/docs/ome), and for production NAT traversal you should set up TURN/STUN with something like [coturn](https://github.com/coturn/coturn/wiki). The Docker example already includes OvenMediaEngine, but it does not provide a TURN setup.

### Run with Docker

Clone the repository, then start the Docker setup:

```bash
git clone https://github.com/lolotronop/trurpchat.git
cd trurpchat/backend
docker compose -f docker-compose.example.yml up --build
```

This starts:

- the Trurpchat backend on port `3000`
- OvenMediaEngine with RTMP ingest on `1935`
- OvenMediaEngine WebRTC signaling/playback on `3333`
- OvenMediaEngine UDP ports `10000-10009`

For anything beyond local testing, copy and adjust `backend/docker-compose.example.yml`:

- set `OVEN_HOST` and `OME_HOST_IP` to the public IP/DNS name clients use to reach your server
- replace `backend/ice.json.example` with your own ICE/TURN config
- follow the OvenMediaEngine docs for deployment details: <https://ovenmediaengine.com/docs/>
- follow the coturn docs for TURN/STUN setup: <https://github.com/coturn/coturn/wiki>

### Run with Bun only

Clone the repository, then install dependencies from the repository root:

```bash
git clone https://github.com/lolotronop/trurpchat.git
cd trurpchat
bun install
```

Create backend config files:

```bash
cd backend
cp .env.example .env
cp ice.json.example ice.json
```

Edit `backend/.env` for your environment. At minimum, make sure `DATABASE_URL` is set. If you are using OvenMediaEngine, configure:

```env
OVEN_HOST=example.com
OVEN_WATCH_PORT=3333  # default websocket port
OVEN_STREAM_PORT=1935 # default RTMP ingest port
OVEN_APP_NAME=app     # default app name in ovenmediaengine
OVEN_SECURE=false     # i don't force https for now
ICE_CONFIG_FILE=ice.json
```

Then run the backend:

```bash
bun run index.ts
```

When running with Bun only, you must provide OvenMediaEngine yourself if you want streaming support. See the OvenMediaEngine docs for setup: <https://ovenmedialabs.com/docs/ome>. For reliable voice/video connectivity outside a LAN, also set up coturn and point `ice.json` at your TURN/STUN servers: <https://github.com/coturn/coturn/wiki>.

Example `backend/ice.json` using a custom TURN server at `example.com`:

```json
{
  "iceServers": [
    {
      "urls": [
        "stun:example.com:3478",
        "turn:example.com:3478?transport=udp",
        "turn:example.com:3478?transport=tcp",
      ],
      "username": "trurpchat-user",
      "credential": "replace-with-your-turn-password"
    }
  ]
}
```

Replace the username and credential with the values from your coturn configuration. If you use a different TURN port or TLS setup, update the `urls` to match your server.
