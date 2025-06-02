package video

import (
	"math/rand"
	"sync"
	"time"

	"github.com/gofiber/websocket/v2"
	"github.com/google/uuid"
)

type Participant struct {
	Host  bool
	ID    string
	Conn  *websocket.Conn
	Mutex sync.Mutex
}

type RoomMap struct {
	Mutex sync.RWMutex
	Map   map[string][]Participant
}

// initialize the room map
func (r *RoomMap) Init() {
	r.Map = make(map[string][]Participant)
}

// get all participants in the room
func (r *RoomMap) Get(roomID string) []Participant {

	r.Mutex.RLock()
	defer r.Mutex.RUnlock()
	return r.Map[roomID]
}

// create the room
func (r *RoomMap) CreateRoom() string {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	rgen := rand.New(rand.NewSource(time.Now().UnixNano()))
	var letters = []rune("cghwdjvbuhg3d287t93oeihodbjwkjbx2HJKBCEIkjg6")
	b := make([]rune, 8)

	for i := range b {
		b[i] = letters[rgen.Intn(len(letters))]
	}

	roomID := string(b)
	r.Map[roomID] = []Participant{}

	return roomID
}

// join a room handler
func (r *RoomMap) InsertInRoom(roomID string, host bool, conn *websocket.Conn) {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	clientID := uuid.New().String()
	NewParticipant := Participant{host, clientID, conn, sync.Mutex{}}

	r.Map[roomID] = append(r.Map[roomID], NewParticipant)
}

// delete a room
func (r *RoomMap) DeleteRoom(roomID string) {
	r.Mutex.Lock()
	defer r.Mutex.Unlock()

	delete(r.Map, roomID)
}
