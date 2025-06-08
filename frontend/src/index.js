let localClientStream;
let websocket;
let remoteClientVideo;
let localClientVideo;
// let peerRef;
let localUserID = null;
let isStreamReady = false;

const peerConnections = new Map();
const connectionStates = new Map();
const participantsLists = new Set();
const pendingOffers = new Map();
const offerQueue = new Set();
let isProcessingOffer = false;

// const peerVideoElements = new Map();
// const availableVideoElements = ['remoteClientVideo1', 'remoteClientVideo2', 'remoteClientVideo3'];

const videoElementManager = {
    availableVideoElements : ['remoteClientVideo1', 'remoteClientVideo2', 'remoteClientVideo3'],
    peerVideoElements : new Map(),

    assignElement(peerId){
        if(this.peerVideoElements.has(peerId)){
            return document.getElementById(this.peerVideoElements.get(peerId));
        }

        if(this.availableVideoElements.length > 0){
            const elementId = this.availableVideoElements.shift();
            this.peerVideoElements.set(peerId, elementId);
            return document.getElementById(elementId);
        }
        return null;
    },

    releseElement(peerId){
        if(this.peerVideoElements.has(peerId)){
            const elementId = this.peerVideoElements.get(peerId);
            const videoelement = document.getElementById(elementId);
            if(videoelement){
                videoelement.srcObject = null;
            }
            this.availableVideoElements.push(elementId);
            this.peerVideoElements.delete(peerId);
        }
    }
};

// Initialize camera and set up video elements
async function initializeCamera() {
    try {
        console.log("Initializing camera...");

        localUserID = 'user_' + Math.random().toString(36).substring(5, 20);
        console.log('user_id', localUserID);

        const stream = await openCamera();
        if (!stream) {
            throw new Error("Failed to get camera stream");
        }

        // the local client video
        localClientVideo = document.getElementById('localClientVideo');
        if(!localClientVideo) throw new Error("local client video not found");

        const remoteVideoIds = ['remoteClientVideo1', 'remoteClientVideo2', 'remoteClientVideo3'];
        const missingElements = [];

        // checking all remote videos exist
        remoteVideoIds.forEach(id =>{
            const element = document.getElementById(id);
            if(!element){
                missingElements.push(id);
            }
        });

        if(missingElements.length > 0){
            throw new Error (`Video elements not found: ${missingElements.join(', ')}`);
        }

        //set local video stream
        localClientVideo.srcObject = stream;
        // Ensure local video plays
        localClientVideo.play().catch(e => console.error("Error playing local video:", e));
        localClientStream = stream;
        isStreamReady = true;
        console.log("Camera initialized successfully");
        console.log("number of avaliable video slots", videoElementManager.availableVideoElements.length);

    } catch (error) {
        console.error("Error initializing camera:", error);
        alert("Failed to access camera. Please make sure you have granted camera permissions.");
    }
}

window.onload = async () => {
    InitApp();
    await initializeCamera();
};

//-------------WEB-RTC------------//
const openCamera = async () => {
    if ('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices) {
        try {
            const allDevices = await navigator.mediaDevices.enumerateDevices();
            const cameras = allDevices.filter((device) => device.kind === 'videoinput');

            const constraints = {
                audio: true,
                video: {
                    deviceId: cameras[0]?.deviceId || undefined,
                },
            }; 

            return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
            console.error("Camera access error:", error);
            throw error;
        }
    } else {
        console.error("Media devices not supported in this browser.");
        throw new Error("Media devices not supported");
    }
};

async function handleSignalMessage(message) {
    console.log("message received", message.type, "from", message.from || message.userId);

    switch(message.type){
        case 'join' :
            await handleUserjoin(message);
            break;
        case 'iceCandidate' :
            await handleIceCandidate(message);
            break;
        case 'offer' :
            await handleOffer(message);
            break;
        case 'answer' :
            await handleAnswer(message);
            break;
        case 'leave' :
            await handleUserLeave(message);
            break;
        case 'participants_list' :
            await handleParticipantsList(message);
            break;
    }
}

export async function InitiateMeeting(mode) {
    if (!isStreamReady) {
        alert("Please wait for camera to initialize");
        return;
    }

    const meetingCodeBox = document.getElementById("meeting_code_box");
    let room_id;

    if (mode === "join") {
        room_id = meetingCodeBox.value;
        if (!room_id) {
            alert("Please enter a meeting code to join.");
            return;
        }
        console.log("Joining a meeting with room ID:", room_id);
    } else if (mode === "create") {
        console.log("Creating a meeting...");
        try {
            const response = await fetch("http://localhost:8080/create-room");
            const data = await response.json();
            room_id = data.roomID;
            if (!room_id) {
                alert("Failed to create room. Please try again.");
                return;
            }
            meetingCodeBox.value = room_id;
            meetingCodeBox.setAttribute("readonly", true);
        } catch (error) {
            console.error("Error creating room:", error);
            alert("Failed to create room. Please try again.");
            return;
        }
    }

    if (!room_id) {
        console.error("No room ID available");
        return;
    }

    try {
        console.log(`Attempting to connect to WebSocket with roomID: ${room_id}`);
        let socket = new WebSocket(`ws://localhost:8080/join-room?roomID=${room_id}`);

        websocket = socket;

        socket.addEventListener("open", () => {
            console.log("WebSocket connection established");
            socket.send(JSON.stringify({
                type: 'join',
                userId: localUserID,
                Timestamp: Date.now()
            }));
        });

        socket.addEventListener("error", (error) => {
            console.error("WebSocket error:", error);
        });

        socket.addEventListener("close", (event) => {
            console.log("WebSocket connection closed:", event.code, event.reason);
            // Only attempt to reconnect if the connection was closed unexpectedly
            if (event.code === 1001 || event.code === 1006) {
                console.log("Attempting to reconnect...");
                setTimeout(() => {
                    InitiateMeeting(mode);
                }, 1000);
            }
        });

        socket.addEventListener("message", async (e) => {
            try {
                const message = JSON.parse(e.data);
                await handleSignalMessage(message);
            } catch (error) {
                console.error("Error handling message:", error);
            }
        });
    } catch (error) {
        console.error("Error setting up WebSocket:", error);
    }
}

const callUser = async (targetUserId) => {
    console.log("Calling other remote user", targetUserId);
    if (!localClientStream) {
        console.error("Local stream not available");
        return;
    }

    // Create new peer connection
    const peerConnection = createPeer(targetUserId);
    peerConnections.set(targetUserId, peerConnection);

    // Add all tracks from local stream
    localClientStream.getTracks().forEach((track) => {
        console.log('Adding track to peer connection:', track.kind);
        peerConnection.addTrack(track, localClientStream);
    });

    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        websocket.send(JSON.stringify({
            type: 'offer',
            from: localUserID,
            to: targetUserId,
            payload: offer
        }));
    } catch (error) {
        console.error("Error creating offer:", error);
        cleanupPeerConnection(targetUserId);
    }
};

async function handleOffer(message) {
    console.log('Received an offer from:', message.from);

    // Create new peer connection if it doesn't exist
    let peerConnection = peerConnections.get(message.from);
    if (!peerConnection) {
        peerConnection = createPeer(message.from);
        peerConnections.set(message.from, peerConnection);
        
        // Add local tracks
        localClientStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track, localClientStream);
        });
    }

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.payload));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        websocket.send(JSON.stringify({
            type: 'answer',
            from: localUserID,
            to: message.from,
            payload: answer
        }));
    } catch (error) {
        console.error('Error handling offer:', error);
        cleanupPeerConnection(message.from);
    }
}

async function handleAnswer(message) {
    try {
        const peerConnection = peerConnections.get(message.from);
        if (!peerConnection) {
            console.error("No peer connection found for answer from:", message.from);
            return;
        }

        if (peerConnection.signalingState === 'have-local-offer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.payload));
            console.log('Remote description set from answer:', message.from);
        } else {
            console.log('Ignoring answer - connection in wrong state:', peerConnection.signalingState);
        }
    } catch (error) {
        console.error('Error handling answer:', error);
        cleanupPeerConnection(message.from);
    }
}

const createPeer = (peerId) => {
    console.log("Creating peer connection", peerId);    
    const peer = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]   
    });

    peer.onnegotiationneeded = () => handleNegotiationNeeded(peerId);
    peer.onicecandidate = (event) => handleIceCandidateEvent(event,peerId);
    peer.ontrack = (event) => handleTrackEvent(event, peerId);
    // peer.oniceconnectionstatechange = () => {
    //     console.log('ICE connection state:', peerId, ':', peer.iceConnectionState);
    // };
    return peer;
};

const handleIceCandidateEvent = (event, peerId) => {
    if (event.candidate) {
        websocket.send(JSON.stringify({ 
            type: 'iceCandidate',
            from: localUserID,
            to: peerId,
            payload: event.candidate
        }));
    }
};

const handleNegotiationNeeded = async (peerId) => {
    console.log('Negotiation needed for:', peerId);
    // Do nothing - we handle offers directly in callUser
};

async function handleIceCandidate(message) {
    const peerConnection = peerConnections.get(message.from);
    if(peerConnection && peerConnection.remoteDescription){
        try {
            await peerConnection.addIceCandidate(message.payload);
        } catch (error) {
            console.error("Error adding ICE candidate:", error);
        }
    }
};

const handleTrackEvent = (event, peerId) => {
    const videoElement = videoElementManager.assignElement(peerId);
    if(videoElement){
        videoElement.srcObject = event.streams[0];
    }
};
//     let videoelement = null;

//     // check if this peer has already a video assigned to it or not
//     if(peerVideoElements.has(peerId)){
//         const elementId = peerVideoElements.get(peerId);
//         videoelement = document.getElementById(elementId);
//     }else{
//         // assign new video element
//         if(availableVideoElements.length > 0){
//             const elementId = availableVideoElements.shift();
//             videoelement = document.getElementById(elementId);
//             peerVideoElements.set(peerId, elementId);
//             console.log('assignes video elements', peerId, 'from', elementId);
//         }
//     }

//     if (videoelement) {
//         videoelement.srcObject = event.streams[0];
//     } else {
//         console.error('no avaliable video element found', peerId);
//     }
// };

function InitApp() {
    console.log("Setting up");
    let status_element = document.getElementById("socket_status");
    if (status_element) {
        status_element.innerHTML = 'Connection Status: Ready';
    }
}

//function for cleaups
function cleanupPeerConnection(peerId){
    console.log("cleaning up peer connection for:", peerId);

    //close peer connection
    const peerConnection = peerConnections.get(peerId);
    if(peerConnection){
        peerConnection.close();
        peerConnections.delete(peerId);
    }

    connectionStates.delete(peerId);
    participantsLists.delete(peerId);
    pendingOffers.delete(peerId);
    videoElementManager.releseElement(peerId);

    console.log("cleanup completed");
}

async function handleUserjoin(message) {
    const newuserId = message.userId;

    if (newuserId === localUserID) {
        console.log("I joined the room");
        return;
    }

    console.log("New user joined:", newuserId);
    participantsLists.add(newuserId);
    
    if (participantsLists.size > 3) {
        console.warn("Room is full, cannot accept more participants");
        return;
    }

    // Only create connection if we don't have one and we're the initiator
    if (!peerConnections.has(newuserId) && localUserID < newuserId) {
        await callUser(newuserId);
    }
}

async function handleParticipantsList(message) {
    const existingParticipants = message.participants || [];
    console.log("📋 Received participants list:", existingParticipants);
    
    // Create connections to all existing participants where we're the initiator
    for (const participantId of existingParticipants) {
        if (participantId !== localUserID && !peerConnections.has(participantId) && localUserID < participantId) {
            participantsLists.add(participantId);
            await callUser(participantId);
        }
    }
}

function handleUserLeave(message){
    const userId = message.from || message.userId;
    if (userId && userId !== localUserID) {
        console.log("👋 User left:", userId);
        cleanupPeerConnection(userId);
    }
}

function connectWebSocket() {
    if (websocket) {
        websocket.close();
    }

    websocket = new WebSocket(`ws://localhost:8080/ws/join/${roomId}`);

    websocket.onopen = () => {
        console.log("WebSocket connection established");
        isConnected = true;
        // Send join message
        websocket.send(JSON.stringify({
            type: 'join',
            from: localUserID,
            to: null,
            payload: null
        }));
    };

    websocket.onerror = (error) => {
        console.error("WebSocket error:", error);
        isConnected = false;
    };

    websocket.onclose = (event) => {
        console.log("WebSocket connection closed:", event.code, event.reason);
        isConnected = false;
        
        // Clean up all peer connections
        for (const [userId, peerConnection] of peerConnections) {
            cleanupPeerConnection(userId);
        }
        
        // Stop all tracks in local stream
        if (localClientStream) {
            localClientStream.getTracks().forEach(track => track.stop());
        }
        
        // Redirect to home page
        window.location.href = '/';
    };

    websocket.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log("Received message:", message);

            switch (message.type) {
                case 'join':
                    handleUserjoin(message);
                    break;
                case 'offer':
                    handleOffer(message);
                    break;
                case 'answer':
                    handleAnswer(message);
                    break;
                case 'iceCandidate':
                    handleIceCandidate(message);
                    break;
                case 'participantsList':
                    handleParticipantsList(message);
                    break;
                case 'leave':
                    handleUserLeave(message);
                    break;
                default:
                    console.warn("Unknown message type:", message.type);
            }
        } catch (error) {
            console.error("Error processing message:", error);
        }
    };
}

// Add cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({
            type: 'leave',
            from: localUserID,
            to: null,
            payload: null
        }));
    }
    
    // Clean up all peer connections
    for (const [userId, peerConnection] of peerConnections) {
        cleanupPeerConnection(userId);
    }
    
    // Stop all tracks in local stream
    if (localClientStream) {
        localClientStream.getTracks().forEach(track => track.stop());
    }
});