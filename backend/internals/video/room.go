package video

import (
	"math/rand"
	"sync"
	"time"

	"github.com/gofiber/websocket/v2"
	"github.com/google/uuid"
)

type Participant struct {
	Host   bool
	ID     string
	UserId string
	Conn   *websocket.Conn
	Mutex  sync.Mutex
}

type RoomMap struct {
	Mutex sync.RWMutex
	Map   map[string][]Participant
}

func (r *RoomMap) Init() {
	r.Map = make(map[string][]Participant)
}

func (r *RoomMap) Get(roomID string) []Participant {
	r.Mutex.RLock()
	defer r.Mutex.RUnlock()
	return r.Map[roomID]
}

func (r *RoomMap) CreateRoom() string {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	rgen := rand.New(rand.NewSource(time.Now().UnixNano()))
	letters := []rune("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
	b := make([]rune, 8)

	for i := range b {
		b[i] = letters[rgen.Intn(len(letters))]
	}

	roomID := string(b)
	r.Map[roomID] = []Participant{}

	return roomID
}

func (r *RoomMap) InsertInRoom(roomID string, host bool, userID string, conn *websocket.Conn) string {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	clientID := uuid.New().String()
	newParticipant := Participant{
		Host:   host,
		ID:     clientID,
		UserId: userID,
		Conn:   conn,
		Mutex:  sync.Mutex{},
	}

	r.Map[roomID] = append(r.Map[roomID], newParticipant)

	return clientID
}

// Remove a client from a room safely
func (r *RoomMap) RemoveClient(roomID string, conn *websocket.Conn) {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	participants, ok := r.Map[roomID]
	if !ok {
		return
	}

	var leavingParticipant Participant
	for i, participant := range participants {
		if participant.Conn == conn {
			leavingParticipant = participant
			if participant.Conn != nil {
				participant.Conn.Close()
			}
			// Remove participant from slice
			r.Map[roomID] = append(participants[:i], participants[i+1:]...)
			break
		}
	}

	// If room empty after removal, delete the room
	if len(r.Map[roomID]) == 0 {
		delete(r.Map, roomID)
	} else {
		// Notify remaining participants about the leave
		for _, participant := range r.Map[roomID] {
			if participant.Conn != nil {
				participant.Conn.WriteJSON(map[string]interface{}{
					"type":    "leave",
					"from":    leavingParticipant.UserId,
					"to":      nil,
					"payload": nil,
				})
			}
		}
	}
}

func (r *RoomMap) DeleteRoom(roomID string) {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	delete(r.Map, roomID)
}
