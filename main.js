import { encodeTransform, decodeTransform, waitLyraReady } from './lyra-transformer';

const codecs = RTCRtpSender.getCapabilities('audio').codecs;
console.log(codecs);

const audioCodec = 'L16';

(async () => {
  const sender = new RTCPeerConnection({encodedInsertableStreams: audioCodec === 'L16'});

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
  });
  const senderAudioTrack = stream.getAudioTracks()[0];
  sender.addTrack(senderAudioTrack);

  const transceiver = sender.getTransceivers()[0];
  transceiver.direction = 'sendonly';

  await waitLyraReady();

  if (audioCodec === 'L16') {
    transceiver.setCodecPreferences(codecs.filter(codec => codec.mimeType === 'audio/telephone-event' && codec.clockRate === 8000));
  }
  if (audioCodec === 'opus') {
    transceiver.setCodecPreferences(codecs.filter(codec => codec.mimeType === 'audio/opus'));
  }

  const offer = await sender.createOffer();
  if (audioCodec === 'L16') {
    offer.sdp = offer.sdp.replace('telephone-event/8000','L16/16000').replace('a=rtpmap:126 L16/16000','a=rtpmap:126 L16/16000\r\na=ptime:20');

    if ('RTCRtpScriptTransform' in window) {
      const worker = new Worker('./lyra-transformer-worker.js', { type: "module" });
      sender.getTransceivers()[0].sender.transform = new RTCRtpScriptTransform(worker, { name: "senderTransform" });
    } else {
      const senderStreams = sender.getTransceivers()[0].sender.createEncodedStreams();
      const transformStream = new TransformStream({
        transform: encodeTransform,
      });

      senderStreams.readable.pipeThrough(transformStream).pipeTo(senderStreams.writable);
    }
  }
  console.log(offer,offer.sdp);
  await sender.setLocalDescription(offer);
  console.log(offer,sender.localDescription,offer.sdp === sender.localDescription.sdp);

  await new Promise(resolve => {
    sender.addEventListener('icegatheringstatechange', ()=>{
      if (sender.iceGatheringState === 'complete') resolve();
    });
    if (sender.iceGatheringState === 'complete') resolve();
  });

  const receiver = new RTCPeerConnection({encodedInsertableStreams: audioCodec === 'L16'});
  receiver.addEventListener('track',ev => {
    console.log(ev);

    if (audioCodec === 'L16') {
      if ('RTCRtpScriptTransform' in window) {
        const worker = new Worker('./lyra-transformer-worker.js', { type: "module" });
        ev.receiver.transform = new RTCRtpScriptTransform(worker, { name: "receiverTransform" });
      } else {
        const receiverStream = ev.receiver.createEncodedStreams();
        const transformStream = new TransformStream({
          transform: decodeTransform,
        });

        receiverStream.readable.pipeThrough(transformStream).pipeTo(receiverStream.writable);
      }
    }

    document.getElementById('audioElem').srcObject = new MediaStream([ev.track]);
  });

  await receiver.setRemoteDescription(sender.localDescription);
  const answer = await receiver.createAnswer();
  if (audioCodec === 'L16') {
    answer.sdp = answer.sdp.replace('a=group:BUNDLE', 'a=group:BUNDLE 0');
    answer.sdp = answer.sdp.replace('m=audio 0 UDP/TLS/RTP/SAVPF 0', 'm=audio 9 UDP/TLS/RTP/SAVPF 126');
    answer.sdp += `a=rtpmap:126 L16/16000\r\na=ptime:20\r\n`;
  }
  console.log(answer.sdp);
  await receiver.setLocalDescription(answer);

  console.log(sender.localDescription, receiver.localDescription);

  await new Promise(resolve => {
    receiver.addEventListener('icegatheringstatechange', ()=>{
      if (receiver.iceGatheringState === 'complete') resolve();
    });
    if (receiver.iceGatheringState === 'complete') resolve();
  });

  await sender.setRemoteDescription(receiver.localDescription);

  console.log(sender.localDescription, receiver.localDescription);
})();

