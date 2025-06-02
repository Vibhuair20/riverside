package video

import (
	"log"

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
	Conn *websocket.Conn
}

var broadcast = make(chan BroadcastMessage)

func broadcaster() {
	for {
		msg := <-broadcast
		for _, client := range AllRooms.Map[msg.RoomID] {
			if client.Conn != msg.Client {
				client.Mutex.Lock()
				defer client.Mutex.Unlock()

				err := client.Conn.WriteJSON(msg.Message)
				if err != nil {
					log.Println("Broadcast error:", err)
					client.Conn.Close()
				}
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

	// Upgrade to WebSocket connection using Fiber
	if websocket.IsWebSocketUpgrade(c) {
		c.Locals("roomID", roomID) // Pass roomID for use in the upgraded handler
		return c.Next()
	}
	return fiber.ErrUpgradeRequired
}

// Separate WebSocket handler
func WebSocketJoinHandler(c *websocket.Conn) {
	roomID := c.Query("roomID")
	if roomID == "" {
		log.Println("roomID is missing in WebSocket connection")
		c.Close()
		return
	}

	log.Printf("New WebSocket connection for room: %s", roomID)

	// Check if room exists
	participants := AllRooms.Get(roomID)
	if participants == nil {
		log.Printf("Room %s does not exist", roomID)
		c.Close()
		return
	}

	// Send join message to all existing participants
	for _, participant := range participants {
		participant.Mutex.Lock()
		err := participant.Conn.WriteJSON(map[string]interface{}{
			"join": true,
		})
		participant.Mutex.Unlock()
		if err != nil {
			log.Printf("Error sending join message: %v", err)
		}
	}

	AllRooms.InsertInRoom(roomID, false, c)

	// Start broadcaster if not already running
	go broadcaster()

	// Handle incoming messages
	for {
		var msg BroadcastMessage
		err := c.ReadJSON(&msg.Message)
		if err != nil {
			log.Printf("Read error in room %s: %v", roomID, err)
			break
		}

		msg.Client = c
		msg.RoomID = roomID

		broadcast <- msg
	}

	// Clean up when connection closes
	c.Close()
}
