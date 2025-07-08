<script lang="ts">
    import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
    import { untrack } from "svelte";
    import { SvelteMap } from "svelte/reactivity";

    let localVideo: HTMLVideoElement;

    let localStream: MediaStream | undefined = $state(undefined);
    let peerConnections: Map<string, RTCPeerConnection> = new SvelteMap();
    let socket: WebSocket;
    let clientId: string;
    let currentRoom: string = $state("");
    let username: string = $state("");
    let roomToJoin: string = $state("");
    let isConnected = $state(false);
    let isInRoom = $state(false);
    let remoteUsers: Array<{ id: string; username?: string }> = $state([]);
    let remoteStreams: SvelteMap<string, MediaStream> = new SvelteMap();
    let userVolumes: SvelteMap<string, number> = new SvelteMap();
    let audioContexts: SvelteMap<string, AudioContext> = new SvelteMap();
    let gainNodes: SvelteMap<string, GainNode> = new SvelteMap();

    let fullMuted = $state(false);
    $effect(() => {
        if (fullMuted) {
            audioContexts.forEach((context) => {
                context.suspend();
            });
        } else {
            audioContexts.forEach((context) => {
                context.resume();
            });
        }

        if (!localStream) {
            return;
        }
        localStream.getAudioTracks().forEach((track) => {
            track.enabled = !fullMuted;
        });
    });

    let muted = $state(false);
    $effect(() => {
        if (!localStream) {
            return;
        }
        localStream.getAudioTracks().forEach((track) => {
            track.enabled = !muted;
        });
    });

    // @ts-ignore
    if (window.__TAURI_INTERNALS__) {
        unregisterAll().then(() => {
            register('F13', (event) => {
              console.log('Shortcut triggered');
              if (event.state == "Pressed") {
                  muted = !muted;
              }
            });
        })
    }



    const SIGNALING_SERVER_URL = "ws://lolo-desktop:3000";
    const TURN_SERVER_IP = "45.143.95.55";
    const ICE_CONFIG = {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            {
                urls: [
                    `stun:${TURN_SERVER_IP}:3478`,
                    `turn:${TURN_SERVER_IP}:3478?transport=udp`,
                    `turn:${TURN_SERVER_IP}:5349?transport=tcp`,
                ],
                username: "testuser",
                credential: "testtoken",
            },
        ],
    };

    $effect(() => {
        untrack(async () => {
            await connectToServer();
            username = "user" + Math.floor(Math.random() * 1000);
            roomToJoin = "room1";
            setTimeout(() => {
                joinRoom();
            }, 1000);
        });
    });

    async function changeBitrate(bitrate: number) {
        BITRATE = bitrate;
        for (const user of remoteUsers.values()) {
            initiateCall(user.id);
        }
    }


    function setAudioMaxInSDP(
        sdp: string | undefined,
        bps: number,
        channels: 1 | 2 = 1
    ): string | undefined {
        if (!sdp) return sdp;

        const ptList: string[] = [];
        const lines = sdp.split(/\r\n|\n/);
        for (const line of lines) {
            const m = line.match(/^a=rtpmap:(\d+)\s+opus\/48000\/(\d+)/i);
            if (m) {
                const pt = m[1];
                ptList.push(pt);
            }
        }

        if (ptList.length === 0) {
            return sdp;
        }

        const newLines = lines.map((line) => {
            let m = line.match(/^a=fmtp:(\d+)\s+(.+)$/i);
            if (m && ptList.includes(m[1])) {
                const pt = m[1];
                let params = m[2].trim();

                if (/maxaveragebitrate=\d+/i.test(params)) {
                    params = params.replace(
                        /maxaveragebitrate=\d+/i,
                        `maxaveragebitrate=${bps}`
                    );
                } else {
                    const sep = params.endsWith(";") ? "" : ";";
                    params = `${params}${sep}maxaveragebitrate=${bps}`;
                }

                if (channels === 2) {
                    if (!/stereo=1/i.test(params)) {
                        params += `;stereo=1`;
                    }
                    if (!/sprop-stereo=1/i.test(params)) {
                        params += `;sprop-stereo=1`;
                    }
                } else {
                    params = params
                        .replace(/;?stereo=\d+/gi, "")
                        .replace(/;?sprop-stereo=\d+/gi, "")
                        .replace(/;;+/g, ";")
                        .replace(/;$/g, "");
                }

                return `a=fmtp:${pt} ${params}`;
            }

            return line;
        });

        const result = newLines.join("\r\n")
        return result;
    }

    function getDeviceIdFromStream(stream: MediaStream) {
        const audioTrack = stream.getAudioTracks()[0];
        return audioTrack?.getSettings().deviceId;
    }

    let availableAudioDevices: MediaDeviceInfo[] = $state([]);
    async function getAvailableAudioDevices() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = devices.filter(device => device.kind === 'audioinput');
        availableAudioDevices = audioDevices;
    }

    let selectedAudioDeviceId: string | undefined = $derived.by(() => {
        if (!localStream) return undefined;
        return getDeviceIdFromStream(localStream);
    });

    function toDb(value: number) {
        return value === 0 ? -Infinity : 20 * Math.log10(value);
    }

    function fromDb(value: number) {
        return value === -Infinity ? 0 : Math.pow(10, value / 20);
    }

    async function createInlineNoiseGate(context: AudioContext, {
      threshold = -50,
      attackTime = 0.01,
      releaseTime = 0.2
    } = {}) {
      // Define the processor as a JS string
      const processorCode = `
          class NoiseGateProcessor extends AudioWorkletProcessor {
            static get parameterDescriptors() {
              return [
                { name: 'threshold', defaultValue: -50,  minValue: -100, maxValue: 0, automationRate: 'k-rate' },
                { name: 'attackTime',  defaultValue: 0.01, minValue: 0.001, maxValue: 1, automationRate: 'k-rate' },
                { name: 'releaseTime', defaultValue: 0.2,  minValue: 0.01,  maxValue: 2, automationRate: 'k-rate' }
              ];
            }
            constructor() {
              super();
              this._gain = 1;
              this._prevIsOpen = false;
            }
            process(inputs, outputs, params) {
              const input = inputs[0];
              const output = outputs[0];

              if (!input || !output || !input[0] || !output[0]) {
                return true;
              }

              const inputChannel = input[0];
              const outputChannel = output[0];

              // Grab the threshold value for this block
              const threshDB = params.threshold[0];
              const threshLin = Math.pow(10, threshDB / 20);

              // Get attack and release times
              const attackTime = params.attackTime[0];
              const releaseTime = params.releaseTime[0];

              // Compute RMS of the input
              let sumSq = 0;
              for (let i = 0; i < inputChannel.length; i++) {
                sumSq += inputChannel[i] * inputChannel[i];
              }
              const rms = Math.sqrt(sumSq / inputChannel.length);

              // Decide whether to open (1) or close (0) gate
              const target = (rms >= threshLin ? 1 : 0);



              // Calculate step size per block (multiply by block size)
              const attackStep = inputChannel.length / (attackTime * sampleRate);
              const releaseStep = inputChannel.length / (releaseTime * sampleRate);

              const oldGain = this._gain;

              // Apply simple linear interpolation for predictable timing
              if (target > this._gain) {
                // Opening gate - use attack step
                this._gain = Math.min(1, this._gain + attackStep);
              } else if (target < this._gain) {
                // Closing gate - use release step
                this._gain = Math.max(0, this._gain - releaseStep);
              }



              // Apply gain to audio and output
              for (let i = 0; i < inputChannel.length; i++) {
                outputChannel[i] = inputChannel[i] * this._gain;
              }

              // Send gate state changes only
              const isOpen = this._gain > 0.1;
              if (isOpen !== this._prevIsOpen) {
                this.port.postMessage({ isOpen });
                this._prevIsOpen = isOpen;
              }

              return true;
            }
          }
          registerProcessor('noise-gate-processor', NoiseGateProcessor);
      `;

      const blob = new Blob([processorCode], { type: 'application/javascript' });
      const blobURL = URL.createObjectURL(blob);
      await context.audioWorklet.addModule(blobURL);
      URL.revokeObjectURL(blobURL);

      // Create the single noise gate node
      const gateNode = new AudioWorkletNode(context, 'noise-gate-processor', {
        parameterData: { threshold, attackTime, releaseTime },
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });

      // Return the single node - no separate gain node needed
      return { gateNode };
    }

    let localSourceNode: MediaStreamAudioSourceNode | undefined;
    let localAudioContext: AudioContext = new AudioContext();
    let localDestination: MediaStreamAudioDestinationNode = localAudioContext.createMediaStreamDestination();
    let localGainNode: GainNode = localAudioContext.createGain();
    let localLimiterNode: DynamicsCompressorNode = localAudioContext.createDynamicsCompressor();
    localLimiterNode.threshold.setValueAtTime(-8, localAudioContext.currentTime);
    localLimiterNode.knee.setValueAtTime(0, localAudioContext.currentTime);
    localLimiterNode.ratio.setValueAtTime(20, localAudioContext.currentTime);
    localLimiterNode.attack.setValueAtTime(0.03, localAudioContext.currentTime);
    localLimiterNode.release.setValueAtTime(0.25, localAudioContext.currentTime);


    let localAnalyserNode: AnalyserNode = localAudioContext.createAnalyser();
    localAnalyserNode.fftSize = 128;

    let localNoiseGate: any = $state(undefined);
    createInlineNoiseGate(localAudioContext).then((v) => {
        localNoiseGate = v;
        console.log('Noise gate created successfully:', localNoiseGate);

        // Handle gate state changes
        localNoiseGate.gateNode.port.onmessage = (e: MessageEvent) => {
           const { isOpen } = e.data;
           localGateState = isOpen ? 1 : 0;
         };
    })
    let localNoiseGateThreshold = $state(-100);
    let localLoudnessPeakLevel = $state(0);
    let localLoudnessLevel = $state(0);
    let localGateState = $state(0); // 0 = closed, 1 = open

    // const PEAK_DECAY = 0.9;
    // let heldPeak = 0;
    // const SMOOTHING_ALPHA = 0.8;
    // let smoothedRms = 0;
    // setInterval(() => {
    //     const bufferLength = localAnalyserNode.fftSize;
    //     const timeDomainData = new Float32Array(bufferLength);
    //     localAnalyserNode.getFloatTimeDomainData(timeDomainData);

    //     let instantPeak = 0;
    //     for (let i = 0; i < bufferLength; i++) {
    //       const absVal = Math.abs(timeDomainData[i]);
    //       if (absVal > instantPeak) instantPeak = absVal;
    //     }

    //     let sumSquares = 0;
    //     for (let i = 0; i < bufferLength; i++) {
    //       sumSquares += timeDomainData[i] * timeDomainData[i];
    //     }
    //     const instantRms = Math.sqrt(sumSquares / bufferLength);

    //     // one-pole smoothing
    //     smoothedRms = SMOOTHING_ALPHA * smoothedRms
    //                 + (1 - SMOOTHING_ALPHA) * instantRms;

    //     heldPeak = Math.max(instantPeak, heldPeak * PEAK_DECAY);
    //     const heldPeakDb = toDb(heldPeak);
    //     localLoudnessPeakLevel = Math.max(0, 60 + heldPeakDb);

    //     localLoudnessLevel = Math.max(0, 60 + toDb(smoothedRms));
    // }, 16.666);


    let localGain: number = $state(1);
    $effect(() => {
        localGainNode.gain.setValueAtTime(localGain, localAudioContext.currentTime);
    })

    let monitor = $state(false)
    $effect(() => {
        if (monitor) {
            localNoiseGate.gateNode.connect(localAudioContext.destination);
        } else {
            try {
                localNoiseGate.gateNode.disconnect(localAudioContext.destination);
            } catch (_) {}
        }
    })
    async function setAudioInputDevice(deviceId?: string) {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: {ideal: deviceId},
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            },
        });
        if (localSourceNode) {
            localSourceNode.disconnect();
        }
        localSourceNode = localAudioContext.createMediaStreamSource(localStream);
        // localSourceNode.connect(localDestination);
        localSourceNode.connect(localGainNode);
        localGainNode.connect(localLimiterNode);
        localLimiterNode.connect(localAnalyserNode);
        localAnalyserNode.connect(localNoiseGate.gateNode);
        localNoiseGate.gateNode.connect(localDestination);
        const [audioTrack] = localDestination.stream.getAudioTracks();

        for (const pc of peerConnections.values()) {
            console.log("Has peerConnections:", pc.connectionState)
            const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
            if (!sender) {
                // pc.addTrack(audioTrack);
            } else {
                await sender.replaceTrack(audioTrack);
            }
        }
    }

    function connectToServer() {
        return new Promise<void>(async (res, _) => {
            try {
                console.log("Connecting to server...");
                await setAudioInputDevice();
                await getAvailableAudioDevices();

                if (localVideo) {
                    const track = localStream?.getVideoTracks()[0];
                    if (track) {
                        const streamFromTrack = new MediaStream([track]);
                        localVideo.srcObject = streamFromTrack;
                        localVideo.muted = true;
                    }
                }

                // Connect to signaling server
                socket = new WebSocket(SIGNALING_SERVER_URL);

                socket.onopen = () => {
                    res();
                    console.log("Connected to signaling server");
                };

                socket.onmessage = handleSignalingMessage;

                socket.onclose = () => {
                    console.log("Disconnected from signaling server");
                    isConnected = false;
                    isInRoom = false;
                    window.location.reload();
                };

                socket.onerror = (error) => {
                    console.error("WebSocket error:", error);
                };
            } catch (error) {
                console.error("Error connecting to server:", error);
            }
        });
    }

    async function joinRoom() {
        if (!socket || !clientId || !roomToJoin.trim() || !username.trim())
            return;

        socket.send(
            JSON.stringify({
                type: "join-room",
                room: roomToJoin.trim(),
                username: username.trim(),
                senderId: clientId,
            }),
        );
    }

    async function leaveRoom() {
        if (!socket || !clientId) return;

        // Close all peer connections
        for (const [userId, pc] of peerConnections.entries()) {
            pc.close();
        }
        peerConnections.clear();
        remoteStreams.clear();
        userVolumes.clear();

        // Clean up audio contexts
        for (const audioContext of audioContexts.values()) {
            audioContext.close();
        }
        audioContexts.clear();
        gainNodes.clear();

        remoteUsers = [];

        socket.send(
            JSON.stringify({
                type: "leave-room",
                senderId: clientId,
            }),
        );
    }

    async function handleSignalingMessage(event: MessageEvent) {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case "connected":
                clientId = data.id;
                isConnected = true;
                console.log("Connected with ID:", clientId);
                break;

            case "room-joined":
                currentRoom = data.room;
                isInRoom = true;
                remoteUsers = data.users;
                console.log(
                    "Joined room:",
                    currentRoom,
                    "with users:",
                    remoteUsers,
                );

                // Initiate calls to existing users
                for (const user of remoteUsers) {
                    await initiateCall(user.id);
                }
                break;

            case "left-room":
                currentRoom = "";
                isInRoom = false;
                remoteUsers = [];
                console.log("Left room");
                break;

            case "user-joined":
                console.log("User joined:", data.userId, data.username);
                remoteUsers.push({ id: data.userId, username: data.username });
                break;

            case "user-left":
                console.log("User left:", data.userId);
                remoteUsers = remoteUsers.filter((u) => u.id !== data.userId);

                // Close peer connection with this user
                const pc = peerConnections.get(data.userId);
                if (pc) {
                    pc.close();
                    peerConnections.delete(data.userId);
                }

                // Remove their video stream
                remoteStreams.delete(data.userId);
                userVolumes.delete(data.userId);
                break;

            case "offer":
                await handleOffer(data.offer, data.sender);
                break;

            case "answer":
                await handleAnswer(data.answer, data.sender);
                break;

            case "ice-candidate":
                await handleIceCandidate(data.candidate, data.sender);
                break;
        }
    }

    async function createPeerConnection(
        targetId: string,
    ): Promise<RTCPeerConnection> {
        if (peerConnections.has(targetId)) {
            const connection = peerConnections.get(targetId)!;
            console.log(`Peer connection with ${targetId} already exists`);
            return connection;
        }

        const pc = new RTCPeerConnection(ICE_CONFIG);

        // Add local stream to peer connection
        const [audioTrack] = localDestination.stream.getAudioTracks();
        pc.addTrack(audioTrack, localDestination.stream);

        // Handle remote stream
        pc.ontrack = (event) => {
            console.log("Received remote stream from:", targetId);
            remoteStreams.set(targetId, event.streams[0]);
            // Initialize volume for this user
            if (!userVolumes.has(targetId)) {
                userVolumes.set(targetId, 1.0);
            }
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.send(
                    JSON.stringify({
                        type: "ice-candidate",
                        candidate: event.candidate,
                        target: targetId,
                        senderId: clientId,
                    }),
                );
            }
        };

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
            console.log(
                `Connection state with ${targetId}:`,
                pc.connectionState,
            );
            if (
                pc.connectionState === "disconnected" ||
                pc.connectionState === "failed"
            ) {
                peerConnections.delete(targetId);
                remoteStreams.delete(targetId);
                userVolumes.delete(targetId);
                console.log(`Connection with ${targetId} failed`);
            }
        };

        pc.onnegotiationneeded = async () => {
            console.log(`Negotiation needed for ${targetId}`);
            if (!pc.localDescription) {
                return;
            }
            for (let user of remoteUsers) {
                initiateCall(user.id)
            }
        }

        peerConnections.set(targetId, pc);
        return pc;
    }


    let BITRATE = 64_000;
    let CHANNELS: 1 | 2 = 1;
    async function initiateCall(targetId: string, restart: boolean = false) {
        if (!socket || !clientId) return;

        console.log("Initiating call to:", targetId);
        const pc = await createPeerConnection(targetId);

        // Create offer
        let offer = await pc.createOffer();
        const sdp = setAudioMaxInSDP(offer.sdp, BITRATE, CHANNELS);
        offer = {...offer, sdp};
        await pc.setLocalDescription(offer);

        // Send offer
        socket.send(
            JSON.stringify({
                type: "offer",
                offer: offer,
                target: targetId,
                senderId: clientId,
            }),
        );
    }

    async function handleOffer(
        offer: RTCSessionDescriptionInit,
        senderId: string,
    ) {
        console.log("Received offer from:", senderId);
        const pc = await createPeerConnection(senderId);

        // Set remote description
        await pc.setRemoteDescription(offer);

        // Create answer
        let answer = await pc.createAnswer();
        const sdp = setAudioMaxInSDP(answer.sdp, BITRATE, CHANNELS);
        answer = {...answer, sdp};
        await pc.setLocalDescription(answer);

        // Send answer
        socket.send(
            JSON.stringify({
                type: "answer",
                answer: answer,
                target: senderId,
                senderId: clientId,
            }),
        );
    }

    async function handleAnswer(
        answer: RTCSessionDescriptionInit,
        senderId: string,
    ) {
        console.log("Received answer from:", senderId);
        const pc = peerConnections.get(senderId);
        if (pc) {
            await pc.setRemoteDescription(answer);
        }
    }

    async function handleIceCandidate(
        candidate: RTCIceCandidateInit,
        senderId: string,
    ) {
        const pc = peerConnections.get(senderId);
        if (pc) {
            await pc.addIceCandidate(candidate);
        }
    }

    function disconnect() {
        if (isInRoom) {
            leaveRoom();
        }

        // Close all peer connections
        for (const pc of peerConnections.values()) {
            pc.close();
        }
        peerConnections.clear();
        remoteStreams.clear();
        userVolumes.clear();

        // Clean up audio contexts
        for (const audioContext of audioContexts.values()) {
            audioContext.close();
        }
        audioContexts.clear();
        gainNodes.clear();

        if (localStream) {
            localStream.getTracks().forEach((track) => track.stop());
        }

        if (localVideo) {
            localVideo.srcObject = null;
        }

        if (socket) {
            socket.close();
        }

        isConnected = false;
        isInRoom = false;
        remoteUsers = [];
        currentRoom = "";
    }

    function getUserDisplayName(user: {
        id: string;
        username?: string;
    }): string {
        return user.username || user.id;
    }

    function getVolumeIcon(volume: number): string {
        if (volume === 0) return "🔇";
        if (volume <= 0.3) return "🔈";
        if (volume <= 1.0) return "🔉";
        if (volume <= 2.0) return "🔊";
        return "📢"; // Amplified volume indicator
    }

    function handleVolumeChange(userId: string, volume: number) {
        userVolumes.set(userId, volume);

        const gainNode = gainNodes.get(userId);
        if (gainNode) {
            gainNode.gain.setValueAtTime(volume, gainNode.context.currentTime);
        } else {
            // Fallback to video volume for values <= 1.0
            const videoElements = document.querySelectorAll(
                `video[data-user-id="${userId}"]`,
            );
            videoElements.forEach((video) => {
                (video as HTMLVideoElement).volume = Math.min(volume, 1.0);
            });
        }
    }

    // Action to set video stream
    function setVideoStream(
        element: HTMLVideoElement,
        { stream, userId }: { stream: MediaStream; userId: string },
    ) {
        if (element && stream) {
            element.srcObject = stream;
            element.setAttribute("data-user-id", userId);

            // Set initial volume
            let volume = userVolumes.get(userId);
            if (volume === undefined) {
                volume = 1.0;
            }

            // Set up Web Audio API for volume amplification
            try {
                const audioContext = new AudioContext({latencyHint: 'playback'});
                const source = audioContext.createMediaStreamSource(stream);
                const gainNode = audioContext.createGain();

                source.connect(gainNode);
                gainNode.connect(audioContext.destination);
                gainNode.gain.setValueAtTime(volume, audioContext.currentTime);

                audioContexts.set(userId, audioContext);
                gainNodes.set(userId, gainNode);

                // Mute the original video element to prevent double audio
                element.volume = 0;
            } catch (error) {
                console.warn(
                    "Web Audio API not supported, falling back to video volume:",
                    error,
                );
                element.volume = Math.min(volume, 1.0);
            }
        }

        return {
            update(newData: { stream: MediaStream; userId: string }) {
                if (element && newData.stream) {
                    element.srcObject = newData.stream;
                    element.setAttribute("data-user-id", newData.userId);

                    let volume = userVolumes.get(newData.userId);
                    if (volume === undefined) {
                        volume = 1.0;
                    }

                    // Clean up old audio context if it exists
                    const oldContext = audioContexts.get(newData.userId);
                    if (oldContext) {
                        oldContext.close();
                        audioContexts.delete(newData.userId);
                        gainNodes.delete(newData.userId);
                    }

                    // Set up new Web Audio API context
                    try {
                        const audioContext = new AudioContext();
                        const source = audioContext.createMediaStreamSource(
                            newData.stream,
                        );
                        const gainNode = audioContext.createGain();

                        source.connect(gainNode);
                        gainNode.connect(audioContext.destination);
                        gainNode.gain.setValueAtTime(
                            volume,
                            audioContext.currentTime,
                        );

                        audioContexts.set(newData.userId, audioContext);
                        gainNodes.set(newData.userId, gainNode);

                        // Mute the original video element to prevent double audio
                        element.volume = 0;
                    } catch (error) {
                        console.warn(
                            "Web Audio API not supported, falling back to video volume:",
                            error,
                        );
                        element.volume = Math.min(volume, 1.0);
                    }
                }
            },
            destroy() {
                // Clean up audio context when element is destroyed
                const audioContext = audioContexts.get(userId);
                if (audioContext) {
                    audioContext.close();
                    audioContexts.delete(userId);
                    gainNodes.delete(userId);
                }
            },
        };
    }
</script>
<main>
    <div class="container">
        <h1>WebRTC Multi-User Video Chat</h1>

        <div class="controls">
            {#if !isConnected}
                <div class="connect-section">
                    <h3>Connect to Server</h3>
                    <button onclick={connectToServer}>Connect to Server</button>
                </div>
            {:else if !isInRoom}
                <div class="room-section">
                    <h3>Join a Room</h3>
                    <div class="input-group">
                        <input
                            type="text"
                            bind:value={username}
                            placeholder="Your username"
                            maxlength="20"
                        />
                        <input
                            type="text"
                            bind:value={roomToJoin}
                            placeholder="Room name"
                            maxlength="20"
                        />
                        <button
                            onclick={joinRoom}
                            disabled={!username.trim() || !roomToJoin.trim()}
                        >
                            Join Room
                        </button>
                    </div>
                </div>
            {:else}
                <div class="room-info">
                    <h3>Room: {currentRoom}</h3>
                    <p>Connected as: {username}</p>
                    <p>Users in room: {remoteUsers.length + 1}</p>
                    <button onclick={leaveRoom}>Leave Room</button>
                    <button onclick={disconnect} class="disconnect-btn"
                        >Disconnect</button
                    >
                </div>
                <div>
                    <div style={`height: 50px; background-color: #f0f0f0; width: 500px`}>
                        <div style={`position: absolute; height: 50px; background-color: #FF0000; width: ${localLoudnessPeakLevel * 500/60}px; transition: all 0.04s ease;`}></div>
                        <div style={`position: absolute; height: 50px; background-color: #00FF00; width: ${localLoudnessLevel * 500/60}px; transition: all 0.04s ease;`}></div>
                    </div>


                    <div>
                        <input id="gate" type="range" min="-60" max="0" step="0.1" style="width: 500px;"
                            bind:value={
                            () => localNoiseGateThreshold,
                            (v) => {
                                localNoiseGateThreshold = v;
                                const param = localNoiseGate?.gateNode?.parameters?.get("threshold")
                                param?.setValueAtTime(v, localAudioContext.currentTime);
                                console.log(v, param)
                            }
                            } ondblclick={() => localNoiseGateThreshold = -30}>
                    </div>
                    <div style={`height: 30px; background-color: #f0f0f0; width: 200px; margin-top: 10px; display: flex; align-items: center; justify-content: center; border-radius: 4px;`}>
                        <div style={`height: 20px; background-color: ${localGateState > 0.5 ? '#00FF00' : '#FF0000'}; border-radius: 2px; transition: all 0.1s ease; width: 100%;`}></div>
                        <span style="position: absolute; color: ${localGateState > 0.5 ? '#000' : '#fff'}; font-size: 12px; font-weight: bold;">GATE</span>
                    </div>

                    <button
                        onclick={() => {
                            muted = !muted;
                        }}
                    >
                        {muted ? 'Unmute' : 'Mute'}
                    </button>

                    <label for="gain">gain</label>
                    <input id="gain" type="range" min="-20" max="16" step="0.1" bind:value={
                        () => {
                            const db = toDb(localGain);
                            if (db === -Infinity) {
                                return -20;
                            }
                            return db;
                        },
                            (v) => localGain = v == -20 ? 0 : fromDb(v)
                        } ondblclick={() => localGain = 1}>

                    <button onclick={() => monitor = !monitor}>
                        {monitor ? 'Monitoring on' : 'Monitoring off'}
                    </button>

                    {#each availableAudioDevices as device (device.deviceId)}
                        <button onclick={() => setAudioInputDevice(device.deviceId)}>
                            {device.label} {device.deviceId === selectedAudioDeviceId ? 'Selected' : ''}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>

        <div class="video-grid">
            <!-- Local video -->
            <div class="video-container local">
                <div class="video-label">You ({username})</div>
                <!-- svelte-ignore a11y_media_has_caption -->
                <video autoplay muted volume={0} bind:this={localVideo}></video>
            </div>

            <!-- Remote videos -->
            {#each Array.from(remoteStreams.entries()) as [userId, stream] (userId)}
                <div class="video-container remote">
                    <div class="video-label">
                        {getUserDisplayName(
                            remoteUsers.find((u) => u.id === userId) || {
                                id: userId,
                            },
                        )}
                    </div>
                    <!-- svelte-ignore a11y_media_has_caption -->
                    <video autoplay use:setVideoStream={{ stream, userId }}
                    ></video>
                    <div class="volume-control">
                        <span class="volume-icon"
                            >{getVolumeIcon(
                                userVolumes.get(userId) || 1.0,
                            )}</span
                        >
                        <input
                            type="range"
                            min="0"
                            max="4"
                            step="0.1"
                            value={userVolumes.get(userId) || 1.0}
                            oninput={(e) =>
                                handleVolumeChange(
                                    userId,
                                    parseFloat((e.target as HTMLInputElement).value),
                                )}
                            class="volume-slider"
                            title="Volume: 0-400% (values above 100% amplify audio)"
                        />
                        <span class="volume-value"
                            >{Math.round(
                                (userVolumes.get(userId) ?? 1.0) * 100,
                            )}%</span
                        >
                    </div>
                </div>
            {/each}
        </div>
    </div>
</main>

<style>
    .container {
        padding: 20px;
        max-width: 1400px;
        margin: 0 auto;
    }

    h1 {
        text-align: left;
        margin-bottom: 30px;
    }

    .controls {
        padding: 20px;
        border-radius: 10px;
        margin-bottom: 30px;
        text-align: left;
    }

    .connect-section h3,
    .room-section h3,
    .room-info h3 {
        margin-bottom: 15px;
    }

    .input-group {
        display: flex;
        gap: 10px;
        justify-content: left;
        flex-wrap: wrap;
    }

    .input-group input {
        padding: 12px;
        border: 2px solid #dee2e6;
        border-radius: 5px;
        font-size: 16px;
        min-width: 150px;
    }

    .input-group input:focus {
        outline: none;
        border-color: #007bff;
    }

    .room-info {
        text-align: left;
    }

    .room-info p {
        margin: 5px 0;
    }

    .video-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
        margin-bottom: 20px;
    }

    .video-container {
        position: relative;
        background: #000;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .video-container.local {
        border: 3px solid #28a745;
    }

    .video-container.remote {
        border: 3px solid #007bff;
    }

    .video-label {
        position: absolute;
        top: 10px;
        left: 10px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 5px 10px;
        border-radius: 5px;
        font-size: 14px;
        font-weight: bold;
        z-index: 10;
    }

    video {
        width: 100%;
        height: 250px;
        object-fit: cover;
    }

    .volume-control {
        position: absolute;
        bottom: 10px;
        left: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.7);
        padding: 8px 12px;
        border-radius: 5px;
        display: flex;
        align-items: left;
        gap: 8px;
        z-index: 10;
    }

    .volume-icon {
        font-size: 16px;
        min-width: 20px;
    }

    .volume-slider {
        flex: 1;
        height: 4px;
        background: #ddd;
        border-radius: 2px;
        outline: none;
        -webkit-appearance: none;
        appearance: none;
    }

    .volume-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        background: #007bff;
        border-radius: 50%;
        cursor: pointer;
    }

    .volume-slider::-moz-range-thumb {
        width: 16px;
        height: 16px;
        background: #007bff;
        border-radius: 50%;
        cursor: pointer;
        border: none;
    }

    .volume-value {
        color: white;
        font-size: 12px;
        min-width: 30px;
        text-align: right;
    }

    button {
        padding: 12px 24px;
        font-size: 16px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        margin: 5px;
        transition: background-color 0.2s;
    }

    button:hover {
        background: #0056b3;
    }

    button:disabled {
        background: #6c757d;
        cursor: not-allowed;
    }

    .disconnect-btn {
        background: #dc3545;
    }

    .disconnect-btn:hover {
        background: #c82333;
    }

    @media (max-width: 768px) {
        .input-group {
            flex-direction: column;
            align-items: left;
        }

        .input-group input {
            width: 100%;
            max-width: 250px;
        }

        .video-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
