let localClientStream;
let websocket;
let remoteClientVideo;
let localClientVideo;
let peerRef;
let isStreamReady = false;

// Initialize camera and set up video elements
async function initializeCamera() {
    try {
        console.log("Initializing camera...");
        const stream = await openCamera();
        if (!stream) {
            throw new Error("Failed to get camera stream");
        }

        localClientVideo = document.getElementById('localClientVideo');
        remoteClientVideo = document.getElementById('remoteClientVideo');

        if (!localClientVideo || !remoteClientVideo) {
            throw new Error("Video elements not found");
        }

        localClientVideo.srcObject = stream;
        localClientStream = stream;
        isStreamReady = true;
        console.log("Camera initialized successfully");
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
    } else {
        console.error("Invalid mode passed to InitiateMeeting");
        return;
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
            socket.send(JSON.stringify({ json: true }));
        });

        socket.addEventListener("error", (error) => {
            console.error("WebSocket error:", error);
        });

        socket.addEventListener("close", (event) => {
            console.log("WebSocket connection closed:", event.code, event.reason);
        });

        socket.addEventListener("message", async (e) => {
            const message = JSON.parse(e.data);
            console.log("Message received:", message);

            if (message.join) {
                console.log("Someone just joined the call");
                await callUser();
            }

            if (message.iceCandidate) {
                console.log("Receiving and adding ICE candidates");
                try {
                    await peerRef.addIceCandidate(message.iceCandidate);
                } catch (error) {
                    console.error("Error adding ICE candidate:", error);
                }
            }

            if (message.offer) {
                await handleOffer(message.offer, socket);
            }

            if (message.answer) {
                await handleAnswer(message.answer);
            }
        });
    } catch (error) {
        console.error("Error creating WebSocket connection:", error);
        return;
    }
}

const handleOffer = async (offer, socket) => {
    console.log('Received an offer, creating an answer');
    peerRef = createPeer();

    try {
        await peerRef.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('Remote description set successfully');

        if (!localClientStream) {
            throw new Error("Local stream not available");
        }

        localClientStream.getTracks().forEach((track) => {
            console.log('Adding track to peer connection:', track.kind);
            peerRef.addTrack(track, localClientStream);
        });

        const answer = await peerRef.createAnswer();
        await peerRef.setLocalDescription(answer);
        console.log('Sending answer to peer');
        socket.send(JSON.stringify({ answer }));
    } catch (error) {
        console.error('Error handling offer:', error);
    }
};

const handleAnswer = async (answer) => {
    try {
        console.log('Received answer, setting remote description');
        await peerRef.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('Remote description set from answer');
    } catch (error) {
        console.error('Error handling answer:', error);
    }
};

const callUser = async () => {
    console.log("Calling other remote user");
    if (!localClientStream) {
        console.error("Local stream not available");
        return;
    }

    peerRef = createPeer();

    localClientStream.getTracks().forEach((track) => {
        console.log('Adding track to peer connection:', track.kind);
        peerRef.addTrack(track, localClientStream);
    });

    await handleNegotiationNeeded();
};

const createPeer = () => {
    console.log("Creating peer connection");
    const peer = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    });

    peer.onnegotiationneeded = handleNegotiationNeeded;
    peer.onicecandidate = handleIceCandidate;
    peer.ontrack = handleTrackEvent;
    peer.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peer.iceConnectionState);
    };

    return peer;
};

const handleNegotiationNeeded = async () => {
    console.log('Creating offer');
    try {
        const myOffer = await peerRef.createOffer();
        await peerRef.setLocalDescription(myOffer);
        console.log('Sending offer to peer');
        websocket.send(JSON.stringify({ offer: peerRef.localDescription }));
    } catch (error) {
        console.error('Error creating offer:', error);
    }
};

const handleIceCandidate = (event) => {
    console.log("Found ICE candidate:", event.candidate);
    if (event.candidate) {
        websocket.send(JSON.stringify({ iceCandidate: event.candidate }));
    }
};

const handleTrackEvent = (event) => {
    console.log("Received tracks:", event.streams[0].getTracks().map(t => t.kind));
    if (remoteClientVideo) {
        remoteClientVideo.srcObject = event.streams[0];
    } else {
        console.error('Remote video element not found');
    }
};

function InitApp() {
    console.log("Setting up");
    let status_element = document.getElementById("socket_status");
    if (status_element) {
        status_element.innerHTML = 'Connection Status: Ready';
    }
}

function ConnectToWebSocket() {
    if (!window.WebSocket) {
        alert("Unable to proceed, browser does not support websocket");
        return false;
    }

    const connection = new WebSocket(`ws://${document.location.host}/ws`);

    connection.onopen = () => console.log("websocket connected");
    connection.onerror = (err) => console.error("websocket error", err);
    connection.onmessage = (msg) => console.log("message received", msg.data);

    return connection;
}