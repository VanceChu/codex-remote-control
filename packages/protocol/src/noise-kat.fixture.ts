import { utf8ToBytes } from "@noble/hashes/utils.js";

export const NOISE_IK_FIXTURE_ID = "noise-ik-25519-chachapoly-sha256-v1";

export const NOISE_IK_FIXTURE = {
  id: NOISE_IK_FIXTURE_ID,
  protocolName: "Noise_IK_25519_ChaChaPoly_SHA256",
  prologue: utf8ToBytes("codex-remote-control noise kat v1"),
  initiatorStaticPrivateKey: hexToBytes(
    "101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f"
  ),
  responderStaticPrivateKey: hexToBytes(
    "303132333435363738393a3b3c3d3e3f404142434445464748494a4b4c4d4e4f"
  ),
  initiatorEphemeralPrivateKey: hexToBytes(
    "505152535455565758595a5b5c5d5e5f606162636465666768696a6b6c6d6e6f"
  ),
  responderEphemeralPrivateKey: hexToBytes(
    "707172737475767778797a7b7c7d7e7f808182838485868788898a8b8c8d8e8f"
  ),
  initiatorPayload: utf8ToBytes("initiator handshake payload"),
  responderPayload: utf8ToBytes("responder handshake payload"),
  controlPlaneAd: utf8ToBytes("crc-control-plane-kat-ad-v1"),
  controlPlanePlaintext: utf8ToBytes("opaque control-plane bytes v1"),
  exportLabel: "crc/noise-ik/export/control-plane/v1",
  expected: {
    initiatorStaticPublicKey: "d89e3bad79437dbed9f843418304f460ff05c7fe81fe4a9577a804cb9367ff66",
    responderStaticPublicKey: "34e42d4af5ef94a07a3a84201b889d4cd1a743cb27b11b6a10438a8feb8e5847",
    initiatorEphemeralPublicKey: "392d174a38b3b1beafaf1fe824870841c5fa531bc6eafdb6402c124664488c1c",
    responderEphemeralPublicKey: "23b7bb8c91ae008711fb12846780bcdf1e065f821bdfec49f57e7c7dcd4c4823",
    message1:
      "392d174a38b3b1beafaf1fe824870841c5fa531bc6eafdb6402c124664488c1c6e23fa619a9898607591b362886731c1bace1c9a3d42d0e1cd2dad0bf50f31504e609f935d37b7506f89c444dbff03cb8f64d660eae0451ba706ea40d54b22463e57d01cd8c06ced0c3c8a262e7304dbab81a81e6cccb13e234d0e",
    message2:
      "23b7bb8c91ae008711fb12846780bcdf1e065f821bdfec49f57e7c7dcd4c48232d97a686f66a067928d3f6b1787838453233b63228f01ea104979f4cb93d4c305bff92cc78c173469b4e9f",
    handshakeHash: "dc02332eaf711193f922ca20bfed7cffcc906be92e7e33e185c5169b628a507f",
    initiatorSendKey: "0f578066a56d52e7bc786eaecaf6379f7201f30bda3e2583cc5177e488cf5e36",
    initiatorReceiveKey: "6bcfc79526d4f83f3ac003ce425e13613c6842c685c704c0a90944fc0d85ee3e",
    responderSendKey: "6bcfc79526d4f83f3ac003ce425e13613c6842c685c704c0a90944fc0d85ee3e",
    responderReceiveKey: "0f578066a56d52e7bc786eaecaf6379f7201f30bda3e2583cc5177e488cf5e36",
    exportedSecret: "ad8b8350dfb8c78464c49f7d2178ae72bbc7eea71b8eeddf20626f70d3134222",
    controlPlaneCiphertext:
      "19487988ccfe8ad366e451f8ddc9e9ef4fb3f0e06a5382d7070165c24a818a823340144060aa414828fdc00e87"
  }
} as const;

export const NOISE_IK_CACOPHONY_VECTOR = {
  source: "https://raw.githubusercontent.com/centromere/cacophony/master/vectors/cacophony.txt",
  vectorIndex: 154,
  protocolName: "Noise_IK_25519_ChaChaPoly_SHA256",
  initPrologue: "4a6f686e2047616c74",
  initStatic: "e61ef9919cde45dd5f82166404bd08e38bceb5dfdfded0a34c8df7ed542214d1",
  initEphemeral: "893e28b9dc6ca8d611ab664754b8ceb7bac5117349a4439a6b0569da977c464a",
  initRemoteStatic: "31e0303fd6418d2f8c0e78b91f22e8caed0fbe48656dcf4767e4834f701b8f62",
  respPrologue: "4a6f686e2047616c74",
  respStatic: "4a3acbfdb163dec651dfa3194dece676d437029c62a408b4c5ea9114246e4893",
  respEphemeral: "bbdb4cdbd309f1a1f2e1456967fe288cadd6f712d65dc7b7793d5e63da6b375b",
  handshakeHash: "0b0f68fb0c27e03ce9b97565995ed4838cc0581b762ef72b062f6a546419fad7",
  messages: [
    {
      payload: "4c756477696720766f6e204d69736573",
      ciphertext:
        "ca35def5ae56cec33dc2036731ab14896bc4c75dbb07a61f879f8e3afa4c7944718da798efbcd91528520204f904b9bd6c7413dccdc214d951e15253e39987f18146e8cd0873654207148333479d4d16c289f0294b29960a72f48e0b7bba2e89083169825e59642148d492020664ccf7"
    },
    {
      payload: "4d757272617920526f746862617264",
      ciphertext:
        "95ebc60d2b1fa672c1f46a8aa265ef51bfe38e7ccb39ec5be34069f1448088435361e70b2ed446e6c9ec387d1d6b3b840f194e373979d241b203c4acafccf5"
    },
    {
      payload: "462e20412e20486179656b",
      ciphertext: "050e9f3c8fac16b68dbce8f8c4bfbf6617c897f9ada4aa29aa19c8"
    },
    {
      payload: "4361726c204d656e676572",
      ciphertext: "344233a6cabb7141d80f3da2fedc311d9646bbb0f505afe403a667"
    },
    {
      payload: "4a65616e2d426170746973746520536179",
      ciphertext: "62cdeeb172ad7ade7aa7d9e069da5790f12331bfa00177787a1d0810c67dc3b2b4"
    },
    {
      payload: "457567656e2042f6686d20766f6e2042617765726b",
      ciphertext: "029bead1b40992327044d409d9a1f3ad8f36c3c452775d557e18bbeb2e8dfcead32d514024"
    }
  ]
} as const;

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Hex string must have even length");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
