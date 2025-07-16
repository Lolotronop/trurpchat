interface Client {
  ws: any;
  id: string;
  room?: string;
  username?: string;
}

const clients = new Map<string, Client>();
const rooms = new Map<string, Set<string>>(); // room -> set of client IDs
rooms.set("Альфа", new Set());
rooms.set("Бета", new Set());

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function broadcastToRoom(room: string, message: any, excludeId?: string) {
  const messageStr = JSON.stringify(message);
  const roomClients = rooms.get(room);

  if (roomClients === undefined) {
    console.warn(`Room ${room} does not exist`);
    return;
  }

  for (const clientId of roomClients) {
    if (clientId === excludeId) {
      continue;
    }

    const client = clients.get(clientId);
    if (client) {
      client.ws.send(messageStr);
    }
  }
}

function getRoomUsers(room: string): Array<{ id: string; username?: string }> {
  const roomClients = rooms.get(room);
  if (!roomClients) return [];

  return Array.from(roomClients)
    .map((clientId) => {
      const client = clients.get(clientId);
      return client ? { id: client.id, username: client.username } : null;
    })
    .filter((user) => user !== null);
}

function removeClientFromRoom(clientId: string) {
  const client = clients.get(clientId);
  if (!client) {
    console.warn(`Client ${clientId} not found`);
    return;
  }
  if (!client.room) {
    console.warn(`Client ${clientId} is not in a room`);
    return;
  }

  const roomClients = rooms.get(client.room);
  if (!roomClients) {
    console.warn(`Room ${client.room} not found`);
    return;
  }

  roomClients.delete(clientId);
  if (roomClients.size === 0) {
    // rooms.delete(client.room);
    console.log(`Room ${client.room} deleted (empty)`);
  } else {
    broadcastToRoom(client.room, {
      type: "user-left",
      userId: clientId,
      username: client.username,
    });
  }
}

function serializeRooms() {
  const r = {};
  for (const room of rooms.keys()) {
    const users = getRoomUsers(room);
    r[room] = users;
  }

  return r;
}

Bun.serve({
  port: 3000,
  fetch(req, server) {
    const thing = req.url.split("/")[3];
    console.log(thing);
    if (thing == "rooms") {
      const r = serializeRooms();
      console.log("Returning to http", r);
      const res = new Response(JSON.stringify(r), { status: 200 });
      res.headers.set("Access-Control-Allow-Origin", "*");
      res.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      return res;
    }
    if (server.upgrade(req)) {
      return;
    }
    return new Response("Upgrade failed", { status: 500 });
  },
  websocket: {
    open(ws) {
      const clientId = generateId();
      const client: Client = {
        ws,
        id: clientId,
      };
      clients.set(clientId, client);

      console.log(`Client ${clientId} connected, ${clients.size} total`);

      ws.subscribe("all");

      ws.send(
        JSON.stringify({
          type: "connected",
          id: clientId,
        }),
      );

      const r = serializeRooms();
      console.log(r);
      setTimeout(() => {
        ws.send(
          JSON.stringify({
            type: "rooms",
            rooms: r,
          }),
        );
      }, 1000);
    },

    message(ws, message) {
      try {
        const data = JSON.parse(message.toString());
        const senderId = data.senderId;
        const client = clients.get(senderId);

        if (!client) {
          console.log("Client not found:", senderId);
          return;
        }

        let r;
        switch (data.type) {
          case "join-room":
            const roomName = data.room;
            const username = data.username || `User-${senderId}`;

            // Remove client from previous room if any
            if (client.room) {
              removeClientFromRoom(senderId);
            }

            // Update client info
            client.room = roomName;
            client.username = username;
            clients.set(senderId, client);

            // Add to room
            if (!rooms.has(roomName)) {
              rooms.set(roomName, new Set());
              console.log(`Room ${roomName} created`);
            }
            rooms.get(roomName)!.add(senderId);

            // Get existing users in room (before adding current user)
            const existingUsers = getRoomUsers(roomName).filter(
              (u) => u.id !== senderId,
            );

            // Notify existing users about new user
            broadcastToRoom(
              roomName,
              {
                type: "user-joined",
                userId: senderId,
                username: username,
              },
              senderId,
            );

            // Send room info to new user
            ws.send(
              JSON.stringify({
                type: "room-joined",
                room: roomName,
                users: existingUsers,
              }),
            );

            r = serializeRooms();
            for (const client of clients.values()) {
              client.ws.send(
                JSON.stringify({
                  type: "rooms",
                  rooms: r,
                }),
              );
            }

            console.log(
              `Client ${senderId} (${username}) joined room ${roomName}`,
            );
            console.log(
              `Room ${roomName} now has ${rooms.get(roomName)?.size} users`,
            );
            break;

          case "offer":
            const offerTarget = clients.get(data.target);
            if (offerTarget) {
              offerTarget.ws.send(
                JSON.stringify({
                  type: "offer",
                  offer: data.offer,
                  sender: senderId,
                }),
              );
              console.log(`Offer sent from ${senderId} to ${data.target}`);
            }
            break;

          case "answer":
            const answerTarget = clients.get(data.target);
            if (answerTarget) {
              answerTarget.ws.send(
                JSON.stringify({
                  type: "answer",
                  answer: data.answer,
                  sender: senderId,
                }),
              );
              console.log(`Answer sent from ${senderId} to ${data.target}`);
            }
            break;

          case "ice-candidate":
            const candidateTarget = clients.get(data.target);
            if (candidateTarget) {
              candidateTarget.ws.send(
                JSON.stringify({
                  type: "ice-candidate",
                  candidate: data.candidate,
                  sender: senderId,
                }),
              );
            }
            break;

          case "leave-room":
            removeClientFromRoom(senderId);
            client.room = undefined;
            client.username = undefined;
            clients.set(senderId, client);

            ws.send(
              JSON.stringify({
                type: "left-room",
              }),
            );

            r = serializeRooms();
            for (const client of clients.values()) {
              client.ws.send(
                JSON.stringify({
                  type: "rooms",
                  rooms: r,
                }),
              );
            }

            break;

          default:
            console.log("Unknown message type:", data.type);
        }
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    },

    close(ws) {
      // Find and remove the client
      let clientToRemove: Client | undefined;
      for (const [id, client] of clients.entries()) {
        if (client.ws === ws) {
          clientToRemove = client;
          removeClientFromRoom(id);
          clients.delete(id);
          break;
        }
      }

      if (clientToRemove) {
        console.log(`Client ${clientToRemove.id} disconnected`);
      }
    },
  },
});

console.log("WebRTC signaling server running on port 3000");
console.log("Rooms and users will be logged as they connect/disconnect");
