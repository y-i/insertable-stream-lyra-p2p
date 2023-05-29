import { encodeTransform, decodeTransform, waitLyraReady } from './lyra-transformer';

const codecs = RTCRtpSender.getCapabilities('audio').codecs;
console.log(codecs);

// const audioCodec = 'opus';
const audioCodec = 'L16';

// 3kbpsを指定してもopusでは無視される
const maxKbps = 6;

(async () => {
  const sender = new RTCPeerConnection({ encodedInsertableStreams: audioCodec === 'L16' });

  document.getElementById('audioFromFile').volume = 0.0000001;
  document.getElementById('audioFromFile').onended = (e) => {
    console.log('sender media ended.')
    sender.close();
  };
  const stream = document.getElementById('audioFromFile').captureStream();

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
    // setCodecPreferencesではL16を指定できないのでSDPを直接書き換える
    // ついでに20ms分のサンプルが必要なのでそこも書き換える
    offer.sdp = offer.sdp.replace('telephone-event/8000', 'L16/16000').replace('a=rtpmap:126 L16/16000', 'a=rtpmap:126 L16/16000\r\na=ptime:20');

    const senderStreams = sender.getTransceivers()[0].sender.createEncodedStreams();
    const transformStream = new TransformStream({
      transform: encodeTransform,
    });

    senderStreams.readable.pipeThrough(transformStream).pipeTo(senderStreams.writable);
  }

  await sender.setLocalDescription(offer);

  await new Promise(resolve => {
    sender.addEventListener('icegatheringstatechange', () => {
      if (sender.iceGatheringState === 'complete') resolve();
    });
    if (sender.iceGatheringState === 'complete') resolve();
  });

  const receiver = new RTCPeerConnection({ encodedInsertableStreams: audioCodec === 'L16' });
  receiver.addEventListener('track', ev => {
    if (audioCodec === 'L16') {
      const receiverStream = ev.receiver.createEncodedStreams();
      const transformStream = new TransformStream({
        transform: decodeTransform,
      });

      receiverStream.readable.pipeThrough(transformStream).pipeTo(receiverStream.writable);
    }

    document.getElementById('audioElem').srcObject = new MediaStream([ev.track]);

    // 以下はファイルの保存用
    const chunks = [];
    const recorder = new MediaRecorder(document.getElementById('audioElem').srcObject, {mimeType: "audio/webm;codecs=opus"});
    recorder.ondataavailable = (e) => {
      chunks.push(e.data);
    }
    recorder.onstop = (e) => {
      console.log('recording stopped.');
      const link = document.createElement('a');
      const blob = new Blob(chunks);
      link.href = window.URL.createObjectURL(blob);
      link.download = `${audioCodec}-${maxKbps}.webm`;
      link.click();
    }
    recorder.start();

    receiver.onconnectionstatechange = (e) => {
      if (receiver.connectionState === 'disconnected') {
        console.log('receiver ended.')
        recorder.stop();
      }
    }
  });

  await receiver.setRemoteDescription(sender.localDescription);
  const answer = await receiver.createAnswer();
  if (audioCodec === 'L16') {
    // sender側と同様に書き換える
    answer.sdp = answer.sdp.replace('a=group:BUNDLE', 'a=group:BUNDLE 0');
    answer.sdp = answer.sdp.replace('m=audio 0 UDP/TLS/RTP/SAVPF 0', 'm=audio 9 UDP/TLS/RTP/SAVPF 126');
    answer.sdp += `a=rtpmap:126 L16/16000\r\na=ptime:20\r\n`;
  }
  await receiver.setLocalDescription(answer);

  await new Promise(resolve => {
    receiver.addEventListener('icegatheringstatechange', () => {
      if (receiver.iceGatheringState === 'complete') resolve();
    });
    if (receiver.iceGatheringState === 'complete') resolve();
  });

  await sender.setRemoteDescription(receiver.localDescription);

  if (audioCodec === 'opus' && maxKbps) {
    const {sender} = transceiver;
    const params = sender.getParameters();
    console.log(params);
    params.encodings[0].maxBitrate = maxKbps * 1000; // 単位がbpsのため
    await sender.setParameters(params);
  }

  // console.log(sender.localDescription, receiver.localDescription);
})();

