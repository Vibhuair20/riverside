package video

import (
	"log"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

var AllRooms RoomMap

type response struct {
	RoomID string `json:"roomID"`
}

type BroadcastMessage struct {
	Message map[string]interface{}
	RoomID  string
	Client  *websocket.Conn
}

type Client struct {
	Conn  *websocket.Conn
	Mutex sync.Mutex
}

var (
	broadcast     = make(chan BroadcastMessage)
	broadcastOnce sync.Once
)

func broadcaster() {
	for msg := range broadcast {
		clients := AllRooms.Get(msg.RoomID)

		// Handle direct messages (offer, answer, iceCandidate)
		if to, exists := msg.Message["to"]; exists && to != "" {
			// Send to specific user
			for i := range clients {
				if clients[i].UserId == to {
					clients[i].Mutex.Lock()
					err := clients[i].Conn.WriteJSON(msg.Message)
					clients[i].Mutex.Unlock()
					if err != nil {
						log.Printf("Error sending direct message: %v", err)
						clients[i].Conn.Close()
						AllRooms.RemoveClient(msg.RoomID, clients[i].Conn)
					}
					break
				}
			}
		} else {
			// Broadcast to all except sender
			for i := 0; i < len(clients); i++ {
				client := &clients[i]
				if client.Conn == msg.Client {
					continue
				}

				client.Mutex.Lock()
				err := client.Conn.WriteJSON(msg.Message)
				client.Mutex.Unlock()

				if err != nil {
					client.Conn.Close()
					AllRooms.RemoveClient(msg.RoomID, client.Conn)
				}
			}
		}
	}
}

func sendParticipantsList(roomID string, newUserConn *websocket.Conn, newUserID string) {
	participants := AllRooms.Get(roomID)

	// Get list of existing user IDs (excluding the new user)
	var existingUsers []string
	for _, participant := range participants {
		if participant.UserId != newUserID {
			existingUsers = append(existingUsers, participant.UserId)
		}
	}

	// Send participants list to the new user
	if len(existingUsers) > 0 {
		participantsMsg := map[string]interface{}{
			"type":         "participants_list",
			"participants": existingUsers,
		}

		for i := range participants {
			if participants[i].Conn == newUserConn && participants[i].UserId == newUserID {
				participants[i].Mutex.Lock()
				err := participants[i].Conn.WriteJSON(participantsMsg)
				participants[i].Mutex.Unlock()
				if err != nil {
					log.Printf("Error sending participants list: %v", err)
				}
				break
			}
		}
	}
}

func CreateRoomRequestHandler(c *fiber.Ctx) error {
	c.Set("Access-Control-Allow-Origin", "*")

	roomID := AllRooms.CreateRoom()
	return c.JSON(response{RoomID: roomID})
}

func JoinRoomRequestHandler(c *fiber.Ctx) error {
	roomID := c.Query("roomID")
	if roomID == "" {
		log.Println("roomID is missing, unable to join the call")
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "roomID is required",
		})
	}

	if websocket.IsWebSocketUpgrade(c) {
		c.Locals("roomID", roomID)
		return c.Next()
	}
	return fiber.ErrUpgradeRequired
}

func WebSocketJoinHandler(c *websocket.Conn) {
	roomID := c.Query("roomID")
	if roomID == "" {
		log.Println("roomID is missing in WebSocket connection")
		c.Close()
		return
	}

	log.Printf("New WebSocket connection for room: %s", roomID)

	participants := AllRooms.Get(roomID)
	if participants == nil {
		log.Printf("Room %s does not exist", roomID)
		c.Close()
		return
	}

	broadcastOnce.Do(func() {
		log.Println("Starting broadcaster goroutine")
		go broadcaster()
	})

	var userID string

	for {
		var msg map[string]interface{}
		err := c.ReadJSON(&msg)
		if err != nil {
			log.Printf("Read error in room %s: %v", roomID, err)
			break
		}

		log.Printf("Received message in room %s: type=%v, from=%v, to=%v",
			roomID, msg["type"], msg["from"], msg["to"])

		if msg["type"] == "join" {
			userID = msg["userId"].(string)
			log.Printf("User %s joining room %s", userID, roomID)
			AllRooms.InsertInRoom(roomID, false, userID, c)

			// Send participants list to new user
			sendParticipantsList(roomID, c, userID)

			// Notify existing participants about new user
			joinMsg := map[string]interface{}{
				"type":   "join",
				"userId": userID,
			}

			broadcast <- BroadcastMessage{
				Message: joinMsg,
				RoomID:  roomID,
				Client:  c,
			}
		}

		if msg["type"] == "leave" {
			log.Printf("User %s leaving room %s", userID, roomID)
			AllRooms.RemoveClient(roomID, c)

			leaveMsg := map[string]interface{}{
				"type":   "leave",
				"from":   userID,
				"userId": userID,
			}

			broadcast <- BroadcastMessage{
				Message: leaveMsg,
				RoomID:  roomID,
				Client:  c,
			}
			break
		}

		broadcast <- BroadcastMessage{
			Message: msg,
			RoomID:  roomID,
			Client:  c,
		}
	}

	log.Printf("Cleaning up connection for user %s in room %s", userID, roomID)
	AllRooms.RemoveClient(roomID, c)

	if userID != "" {
		leaveMsg := map[string]interface{}{
			"type":   "leave",
			"from":   userID,
			"userId": userID,
		}

		broadcast <- BroadcastMessage{
			Message: leaveMsg,
			RoomID:  roomID,
			Client:  c,
		}
	}

	c.Close()
}
